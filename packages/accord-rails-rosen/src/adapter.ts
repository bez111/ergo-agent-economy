// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-rosen — Rosen-bridged stablecoin rail adapter
//
// Same on-chain primitive as rails-ergo (R4 reserve / R6 task-hash on an
// Ergo Note), but the value lives in a wrapped token (rsUSDT / rsUSDC /
// rsBTC) carried in the box's tokens[] array, NOT in the box's nanoERG
// `value` field. The adapter:
//
//   1. resolves the agreement's currency → tokenId via the caller-supplied
//      tokenRegistry,
//   2. fetches the Note via `ops.checkNote`,
//   3. runs the same expiry / reserve / R6 / value checks as rails-ergo, but
//      compares against the token amount, not the ERG value.
//
// Settlement Receipt:
//   * rail = "rosen"
//   * mode allow-list = note_redeemed | reserve_refunded | batch_settled
//     (same as Ergo per ACCORD-003)
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  type AccordSettlementReceipt,
} from "@accord-protocol/core";
import { blake2b } from "@noble/hashes/blake2";

import type {
  AccordRailAdapter,
  SettleInput,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "@accord-protocol/rails";

import { decimalToBaseUnits } from "./units.js";
import type {
  RosenCurrency,
  RosenNoteOps,
  RosenPaymentProof,
  RosenRailAdapterOptions,
  RosenTokenRegistry,
} from "./types.js";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export const ROSEN_RAIL_ERROR_CODES = {
  INVALID_PAYMENT_SHAPE: "INVALID_PAYMENT_SHAPE",
  NOTE_NOT_FOUND: "NOTE_NOT_FOUND",
  NOTE_EXPIRED: "NOTE_EXPIRED",
  RESERVE_MISMATCH: "RESERVE_MISMATCH",
  TASK_HASH_MISSING: "TASK_HASH_MISSING",
  TASK_HASH_MISMATCH: "TASK_HASH_MISMATCH",
  CURRENCY_NOT_REGISTERED: "CURRENCY_NOT_REGISTERED",
  CURRENCY_NOT_SUPPORTED: "CURRENCY_NOT_SUPPORTED",
  TOKEN_NOT_PRESENT: "TOKEN_NOT_PRESENT",
  INSUFFICIENT_VALUE: "INSUFFICIENT_VALUE",
} as const;

const SUPPORTED_CURRENCIES = new Set<RosenCurrency>(["rsUSDT", "rsUSDC", "rsBTC"]);

export function createRosenRailAdapter(opts: RosenRailAdapterOptions): AccordRailAdapter {
  const network = opts.network ?? opts.ops.network;
  const ops = opts.ops;
  const tokens = opts.tokens;

  return {
    rail: "rosen",
    verifyPayment: (input) => verifyPayment(ops, tokens, input),
    settle: (input) => settle(ops, network, input),
  };
}

// ── verifyPayment ───────────────────────────────────────────────────────────

async function verifyPayment(
  ops: RosenNoteOps,
  tokens: RosenTokenRegistry,
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResult> {
  // 1. Shape.
  const proof = input.payment as Partial<RosenPaymentProof> | null | undefined;
  if (!proof || typeof proof !== "object") {
    return rejection("INVALID_PAYMENT_SHAPE", "payment must be an object");
  }
  if (typeof proof.note_box_id !== "string" || !HEX_64.test(proof.note_box_id)) {
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      "payment.note_box_id must be 64 lower/upper-case hex chars",
    );
  }
  if (proof.task_output === undefined || proof.task_output === null) {
    return rejection("INVALID_PAYMENT_SHAPE", "payment.task_output is required");
  }

  // 2. Currency must be a Rosen-supported one.
  const currency = input.agreement.price.currency;
  if (!SUPPORTED_CURRENCIES.has(currency as RosenCurrency)) {
    return rejection(
      "CURRENCY_NOT_SUPPORTED",
      `rails-rosen supports {rsUSDT, rsUSDC, rsBTC} at v0; agreement asks for ${currency}.`,
    );
  }
  const tokenEntry = tokens[currency as RosenCurrency];
  if (!tokenEntry) {
    return rejection(
      "CURRENCY_NOT_REGISTERED",
      `currency ${currency} is supported but the caller did not provide a tokenId mapping. ` +
        `Pass it via createRosenRailAdapter({ tokens: { ${currency}: { tokenId, decimals } } }).`,
    );
  }
  if (tokenEntry.decimals !== input.agreement.price.decimals) {
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      `agreement.price.decimals (${input.agreement.price.decimals}) ≠ registry decimals for ${currency} (${tokenEntry.decimals})`,
    );
  }

  // 3. Fetch the Note.
  let note;
  try {
    note = await ops.checkNote(proof.note_box_id);
  } catch (err) {
    return rejection(
      "NOTE_NOT_FOUND",
      `checkNote(${shorten(proof.note_box_id)}) failed: ${stringifyError(err)}`,
    );
  }

  // 4. Expiry.
  if (note.isExpired) {
    return rejection(
      "NOTE_EXPIRED",
      `Note expired at block ${note.expiryBlock}; current ${note.currentBlock}`,
    );
  }

  // 5. Reserve binding.
  const expectedReserve = stripReservePrefix(input.agreement.payment.reserve_ref);
  if (expectedReserve && note.reserveBoxId && note.reserveBoxId.toLowerCase() !== expectedReserve) {
    return rejection(
      "RESERVE_MISMATCH",
      `Note's R4 ${shorten(note.reserveBoxId)} ≠ agreement's reserve_ref ${shorten(expectedReserve)}`,
    );
  }

  // 6. Task-hash binding.
  if (!note.taskHash) {
    return rejection(
      "TASK_HASH_MISSING",
      "Note has no R6 task hash; v0 Notes must carry one (SPEC §3 / I-002)",
    );
  }
  const computed = computeTaskHashHex(proof.task_output);
  if (computed !== note.taskHash.toLowerCase()) {
    return rejection(
      "TASK_HASH_MISMATCH",
      `blake2b256(task_output) = ${shorten(computed)} ≠ Note R6 ${shorten(note.taskHash)}`,
    );
  }

  // 7. Token-amount lookup + value check.
  const carried = note.tokens.find(
    (t) => t.tokenId.toLowerCase() === tokenEntry.tokenId.toLowerCase(),
  );
  if (!carried) {
    return rejection(
      "TOKEN_NOT_PRESENT",
      `Note does not carry the ${currency} token (${shorten(tokenEntry.tokenId)})`,
    );
  }
  let required: bigint;
  try {
    required = decimalToBaseUnits(
      input.agreement.price.amount,
      input.agreement.price.decimals,
    );
  } catch (err) {
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      `agreement price could not be quantised: ${stringifyError(err)}`,
    );
  }
  if (carried.amount < required) {
    return rejection(
      "INSUFFICIENT_VALUE",
      `Note ${currency} amount ${carried.amount} < required ${required} (base units, ${tokenEntry.decimals} decimals)`,
    );
  }

  return {
    ok: true,
    rail: "rosen",
    payment_id: note.boxId,
    details: {
      currency,
      token_id: tokenEntry.tokenId,
      token_amount: carried.amount.toString(),
      note_expires_at: note.expiryBlock,
      reserve_box_id: note.reserveBoxId ?? null,
    },
  };
}

// ── settle ──────────────────────────────────────────────────────────────────

async function settle(
  ops: RosenNoteOps,
  network: "mainnet" | "testnet",
  input: SettleInput,
): Promise<AccordSettlementReceipt> {
  const proof = input.payment as RosenPaymentProof;
  const result = await ops.redeemNote({
    noteBoxId: proof.note_box_id,
    taskOutput: proof.task_output,
    receiverAddress: proof.receiver_address,
  });

  const agreement = input.agreement;
  return {
    type: "accord.settlement_receipt.v0",
    version: "v0",
    settlement_id: makeSettlementId(agreement.agreement_id, result.txId ?? proof.note_box_id),
    agreement_id: agreement.agreement_id,
    agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
    ...(input.verification
      ? { verification_receipts: [input.verification.receipt_id] }
      : {}),
    rail: "rosen",
    mode: "note_redeemed",
    status: result.submitted ? "settled" : "pending",
    amount: agreement.price.amount,
    currency: agreement.price.currency,
    decimals: agreement.price.decimals,
    tx: {
      network,
      tx_id: ensureTxId(result.txId, proof.note_box_id),
      box_id: proof.note_box_id.toLowerCase(),
    },
    created_at: nowIsoUtc(),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rejection(
  codeKey: keyof typeof ROSEN_RAIL_ERROR_CODES,
  message: string,
): VerifyPaymentResult {
  return { ok: false, rail: "rosen", code: ROSEN_RAIL_ERROR_CODES[codeKey], message };
}

function computeTaskHashHex(taskOutput: string | Uint8Array): string {
  const bytes =
    typeof taskOutput === "string" ? new TextEncoder().encode(taskOutput) : taskOutput;
  const digest = blake2b(bytes, { dkLen: 32 });
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    out += (digest[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function stripReservePrefix(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const candidate = ref.replace(/^ergo:box:/i, "").replace(/^ergo:/i, "").toLowerCase();
  return HEX_64.test(candidate) ? candidate : undefined;
}

function makeSettlementId(agreementId: string, anchor: string): string {
  const seed = `${agreementId}:${anchor}`;
  const hash = accordHashV0(seed);
  const base32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; out.length < 26; i = (i + 1) % hash.length) {
    value = (value << 4) | parseInt(hash[i] as string, 16);
    bits += 4;
    if (bits >= 5) {
      bits -= 5;
      out += base32[(value >> bits) & 0x1f] as string;
    }
  }
  return "sr_" + out;
}

function ensureTxId(txId: string | undefined, fallback: string): string {
  if (txId && txId.length > 0) return txId.toLowerCase();
  return fallback.toLowerCase();
}

function nowIsoUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function shorten(s: string): string {
  return s.length > 12 ? s.slice(0, 8) + "…" : s;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
