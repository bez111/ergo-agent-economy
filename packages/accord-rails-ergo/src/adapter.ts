// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-ergo — Ergo Note rail adapter
//
// Implements `AccordRailAdapter` (from @accord-protocol/rails) backed by a
// pluggable `ErgoNoteOps` (typically `ergo-agent-pay`'s `ErgoAgentPay`).
//
// verifyPayment:
//   1. Validate the buyer's payment-proof shape (note_box_id is 64 hex,
//      task_output present).
//   2. Fetch the Note via ops.checkNote(boxId).
//   3. Reject expired Notes.
//   4. Reject if the Note's R4 (reserveBoxId) doesn't match
//      agreement.payment.reserve_ref.
//   5. Reject if the Note's R6 (taskHash) is missing or doesn't equal
//      blake2b256(task_output).
//   6. Reject if the Note's value < required nanoERG (or base units for
//      non-ERG tokens, per agreement.price.decimals).
//   7. Return ok with payment_id = note.boxId.
//
// settle:
//   * Calls ops.redeemNote(...) with the same task_output.
//   * Emits a v0 Settlement Receipt with rail="ergo", mode="note_redeemed".
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  type AccordAgreement,
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
  ErgoNoteOps,
  ErgoPaymentProof,
  ErgoRailAdapterOptions,
} from "./types.js";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export const ERGO_RAIL_ERROR_CODES = {
  INVALID_PAYMENT_SHAPE: "INVALID_PAYMENT_SHAPE",
  NOTE_NOT_FOUND: "NOTE_NOT_FOUND",
  NOTE_EXPIRED: "NOTE_EXPIRED",
  RESERVE_MISMATCH: "RESERVE_MISMATCH",
  TASK_HASH_MISSING: "TASK_HASH_MISSING",
  TASK_HASH_MISMATCH: "TASK_HASH_MISMATCH",
  INSUFFICIENT_VALUE: "INSUFFICIENT_VALUE",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
} as const;

/** Build an Ergo rail adapter over a pluggable `ErgoNoteOps`. */
export function createErgoRailAdapter(opts: ErgoRailAdapterOptions): AccordRailAdapter {
  const network = opts.network ?? opts.ops.network;
  const ops = opts.ops;

  return {
    rail: "ergo",
    verifyPayment: (input) => verifyPayment(ops, input),
    settle: (input) => settle(ops, network, input),
  };
}

// ── verifyPayment ───────────────────────────────────────────────────────────

async function verifyPayment(
  ops: ErgoNoteOps,
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResult> {
  // 1. Shape check.
  const proof = input.payment as Partial<ErgoPaymentProof> | null | undefined;
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
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      "payment.task_output is required (the bytes the Note's R6 was committed to)",
    );
  }

  // 2. Fetch the Note.
  let note;
  try {
    note = await ops.checkNote(proof.note_box_id);
  } catch (err) {
    return rejection(
      "NOTE_NOT_FOUND",
      `checkNote(${shorten(proof.note_box_id)}) failed: ${stringifyError(err)}`,
    );
  }

  // 3. Expiry.
  if (note.isExpired) {
    return rejection(
      "NOTE_EXPIRED",
      `Note expired at block ${note.expiryBlock}; current height ${note.currentBlock}`,
    );
  }

  // 4. Reserve binding.
  const expectedReserve = stripReservePrefix(input.agreement.payment.reserve_ref);
  if (expectedReserve && note.reserveBoxId && note.reserveBoxId !== expectedReserve) {
    return rejection(
      "RESERVE_MISMATCH",
      `Note's R4 reserve ${shorten(note.reserveBoxId)} ≠ agreement's reserve_ref ${shorten(expectedReserve)}`,
    );
  }

  // 5. Task-hash binding.
  if (!note.taskHash) {
    return rejection(
      "TASK_HASH_MISSING",
      "Note has no R6 task hash; v0 Notes must carry one (see SPEC §3 / I-002)",
    );
  }
  const computedTaskHash = computeTaskHashHex(proof.task_output);
  if (computedTaskHash !== note.taskHash.toLowerCase()) {
    return rejection(
      "TASK_HASH_MISMATCH",
      `blake2b256(task_output) = ${shorten(computedTaskHash)} ≠ Note R6 ${shorten(note.taskHash)}`,
    );
  }

  // 6. Value comparison.
  if (input.agreement.price.currency !== "ERG") {
    return rejection(
      "CURRENCY_MISMATCH",
      `rails-ergo only supports currency=ERG at v0; agreement asks for ${input.agreement.price.currency}. ` +
        `Use rails-rosen for rsUSDT/rsUSDC/rsBTC, rails-base for USDC.`,
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
  if (note.value < required) {
    return rejection(
      "INSUFFICIENT_VALUE",
      `Note value ${note.value} nanoERG < required ${required} nanoERG`,
    );
  }

  return {
    ok: true,
    rail: "ergo",
    payment_id: note.boxId,
    details: {
      note_value_nano_erg: note.value.toString(),
      note_expires_at: note.expiryBlock,
      reserve_box_id: note.reserveBoxId ?? null,
    },
  };
}

// ── settle ──────────────────────────────────────────────────────────────────

async function settle(
  ops: ErgoNoteOps,
  network: "mainnet" | "testnet",
  input: SettleInput,
): Promise<AccordSettlementReceipt> {
  const proof = input.payment as ErgoPaymentProof;
  const result = await ops.redeemNote({
    noteBoxId: proof.note_box_id,
    taskOutput: proof.task_output,
    receiverAddress: proof.receiver_address,
  });

  const agreement = input.agreement;
  return {
    type: "accord.settlement_receipt.v0",
    version: "v0",
    settlement_id: makeSettlementId(agreement, result.txId ?? proof.note_box_id),
    agreement_id: agreement.agreement_id,
    agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
    rail: "ergo",
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
  codeKey: keyof typeof ERGO_RAIL_ERROR_CODES,
  message: string,
): VerifyPaymentResult {
  return { ok: false, rail: "ergo", code: ERGO_RAIL_ERROR_CODES[codeKey], message };
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

/**
 * Strip a leading rail prefix from `reserve_ref`. Accepts both
 *   - the wire form (`ergo:box:abc...` or `ergo:abc...`), and
 *   - the bare 64-hex box id.
 *
 * Returns undefined if the value can't be coerced to a 64-hex id —
 * verifyPayment treats that as "no reserve binding to check" rather
 * than rejecting outright.
 */
function stripReservePrefix(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const candidate = ref
    .replace(/^ergo:box:/i, "")
    .replace(/^ergo:/i, "")
    .toLowerCase();
  return HEX_64.test(candidate) ? candidate : undefined;
}

function makeSettlementId(agreement: AccordAgreement, txOrBox: string): string {
  // ULID-shaped (sr_ + 26 base32 chars) — schema-conformant.
  const seed = `${agreement.agreement_id}:${txOrBox}`;
  const hash = accordHashV0(seed);
  // 26 chars from a hex digest, upper-cased and substituted to base32 alphabet.
  const base32Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; out.length < 26; i = (i + 1) % hash.length) {
    value = (value << 4) | parseInt(hash[i] as string, 16);
    bits += 4;
    if (bits >= 5) {
      bits -= 5;
      out += base32Alphabet[(value >> bits) & 0x1f] as string;
    }
  }
  return "sr_" + out;
}

function ensureTxId(txId: string | undefined, fallback: string): string {
  if (txId && txId.length > 0) return txId.toLowerCase();
  // Pre-confirmation submit: pad with the box id so the schema's tx_id
  // regex (any hex) is satisfied. Status is "pending" in that case.
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
