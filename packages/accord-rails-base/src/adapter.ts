// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-base — Base / EVM Note rail adapter
//
// Implements `AccordRailAdapter` (from @accord-protocol/rails) backed by a
// pluggable `BaseNoteOps` (typically `agentpay-base`'s `BaseAgentPay`).
//
// Cross-rail differences vs rails-ergo:
//   * keccak256 acceptance predicate (vs blake2b256 on Ergo)
//   * settlement mode allow-list: redeemed | refund_expired (per ACCORD-003)
//   * payment_id = the EVM tx hash of issuance (or noteId if tx_hash absent)
//   * refund() is a real on-chain operation (refundExpired contract method)
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  type AccordSettlementReceipt,
} from "@accord-protocol/core";
import { keccak_256 } from "@noble/hashes/sha3";

import type {
  AccordRailAdapter,
  RefundInput,
  SettleInput,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "@accord-protocol/rails";

import { decimalToBaseUnits } from "./units.js";
import type {
  BaseNoteOps,
  BasePaymentProof,
  BaseRailAdapterOptions,
  Hex,
} from "./types.js";

const HEX_NOTE_ID = /^0x[0-9a-fA-F]{64}$/;

export const BASE_RAIL_ERROR_CODES = {
  INVALID_PAYMENT_SHAPE: "INVALID_PAYMENT_SHAPE",
  NOTE_NOT_FOUND: "NOTE_NOT_FOUND",
  NOTE_EXPIRED: "NOTE_EXPIRED",
  NOTE_ALREADY_REDEEMED: "NOTE_ALREADY_REDEEMED",
  TASK_HASH_MISSING: "TASK_HASH_MISSING",
  TASK_HASH_MISMATCH: "TASK_HASH_MISMATCH",
  INSUFFICIENT_VALUE: "INSUFFICIENT_VALUE",
  CURRENCY_NOT_SUPPORTED: "CURRENCY_NOT_SUPPORTED",
} as const;

/** Build a Base/EVM rail adapter over a pluggable `BaseNoteOps`. */
export function createBaseRailAdapter(opts: BaseRailAdapterOptions): AccordRailAdapter {
  const network = opts.network ?? opts.ops.network;
  const ops = opts.ops;

  return {
    rail: "base",
    verifyPayment: (input) => verifyPayment(ops, input),
    settle: (input) => settleAndReceipt(ops, network, input, "redeemed"),
    refund: (input) => refundAndReceipt(ops, network, input),
  };
}

// ── verifyPayment ───────────────────────────────────────────────────────────

async function verifyPayment(
  ops: BaseNoteOps,
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResult> {
  const proof = input.payment as Partial<BasePaymentProof> | null | undefined;
  if (!proof || typeof proof !== "object") {
    return rejection("INVALID_PAYMENT_SHAPE", "payment must be an object");
  }
  if (typeof proof.note_id !== "string" || !HEX_NOTE_ID.test(proof.note_id)) {
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      "payment.note_id must be 0x + 64 hex chars",
    );
  }
  if (proof.task_output === undefined || proof.task_output === null) {
    return rejection(
      "INVALID_PAYMENT_SHAPE",
      "payment.task_output is required",
    );
  }

  let note;
  try {
    note = await ops.checkNote(proof.note_id);
  } catch (err) {
    return rejection(
      "NOTE_NOT_FOUND",
      `checkNote(${shorten(proof.note_id)}) failed: ${stringifyError(err)}`,
    );
  }

  if (!note.exists) {
    return rejection("NOTE_NOT_FOUND", `Note ${shorten(proof.note_id)} not found on chain`);
  }
  if (note.redeemed) {
    return rejection(
      "NOTE_ALREADY_REDEEMED",
      `Note ${shorten(proof.note_id)} is already redeemed or refunded`,
    );
  }
  if (note.isExpired) {
    return rejection(
      "NOTE_EXPIRED",
      `Note expired at block ${note.expiryBlock}; current ${note.currentBlock}`,
    );
  }

  // Currency: rails-base supports any ERC-20-denominated agreement. Token
  // mapping (USDC/USDT/etc → contract address) is the seller's deployment
  // concern — the rail adapter just accepts the agreement's currency name
  // and trusts the contract's accounting.
  const supportedCurrencies = new Set(["USDC", "USDT"]);
  if (!supportedCurrencies.has(input.agreement.price.currency)) {
    return rejection(
      "CURRENCY_NOT_SUPPORTED",
      `rails-base supports {USDC, USDT} at v0; agreement asks for ${input.agreement.price.currency}. ` +
        `Use rails-ergo for ERG, rails-rosen for rsUSDT/rsUSDC/rsBTC.`,
    );
  }

  // Task-hash binding (keccak256, not blake2b256).
  const ZERO_HASH = "0x" + "00".repeat(32);
  if (note.taskHash.toLowerCase() === ZERO_HASH) {
    return rejection(
      "TASK_HASH_MISSING",
      "Note has unconditional task hash (0x00…); v0 Accord engagements require a non-zero predicate",
    );
  }
  const computedHash = "0x" + keccak256Hex(proof.task_output);
  if (computedHash !== note.taskHash.toLowerCase()) {
    return rejection(
      "TASK_HASH_MISMATCH",
      `keccak256(task_output) = ${shorten(computedHash)} ≠ Note taskHash ${shorten(note.taskHash)}`,
    );
  }

  // Value comparison.
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
  if (note.amount < required) {
    return rejection(
      "INSUFFICIENT_VALUE",
      `Note amount ${note.amount} < required ${required} (${input.agreement.price.currency} base units)`,
    );
  }

  // payment_id = tx_hash if the buyer supplied it (preferred — anchors the
  // claim to a specific issuance tx); else fall back to the noteId.
  const paymentId = proof.tx_hash ?? proof.note_id;

  return {
    ok: true,
    rail: "base",
    payment_id: paymentId,
    details: {
      note_amount: note.amount.toString(),
      note_expires_at: note.expiryBlock.toString(),
      issuer: note.issuer,
      recipient: note.recipient,
    },
  };
}

// ── settle / refund ─────────────────────────────────────────────────────────

async function settleAndReceipt(
  ops: BaseNoteOps,
  network: BaseRailAdapterOptions["network"] = "base-sepolia",
  input: SettleInput,
  mode: "redeemed" | "refund_expired",
): Promise<AccordSettlementReceipt> {
  const proof = input.payment as BasePaymentProof;
  const result = await ops.redeemNote(proof.note_id, proof.task_output);
  return makeReceipt(
    input.agreement,
    network,
    mode,
    result.txHash,
    proof.note_id,
    "settled",
    input.verification?.receipt_id,
  );
}

async function refundAndReceipt(
  ops: BaseNoteOps,
  network: BaseRailAdapterOptions["network"] = "base-sepolia",
  input: RefundInput,
): Promise<AccordSettlementReceipt> {
  if (!ops.refundExpired) {
    throw new Error(
      "rails-base: ops.refundExpired is not implemented on the backing BaseNoteOps",
    );
  }
  const proof = input.payment as BasePaymentProof;
  const result = await ops.refundExpired(proof.note_id);
  return makeReceipt(
    input.agreement,
    network,
    "refund_expired",
    result.txHash,
    proof.note_id,
    "refunded",
  );
}

function makeReceipt(
  agreement: VerifyPaymentInput["agreement"],
  network: BaseRailAdapterOptions["network"],
  mode: "redeemed" | "refund_expired",
  txHash: Hex,
  noteId: Hex,
  status: "settled" | "refunded",
  verificationReceiptId?: string,
): AccordSettlementReceipt {
  return {
    type: "accord.settlement_receipt.v0",
    version: "v0",
    settlement_id: makeSettlementId(agreement.agreement_id, txHash),
    agreement_id: agreement.agreement_id,
    agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
    ...(verificationReceiptId ? { verification_receipts: [verificationReceiptId] } : {}),
    rail: "base",
    mode,
    status,
    amount: agreement.price.amount,
    currency: agreement.price.currency,
    decimals: agreement.price.decimals,
    tx: {
      network: (network ?? "base-sepolia") as AccordSettlementReceipt["tx"]["network"],
      tx_id: txHash.toLowerCase(),
      box_id: noteId.toLowerCase(),
    },
    created_at: nowIsoUtc(),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rejection(
  codeKey: keyof typeof BASE_RAIL_ERROR_CODES,
  message: string,
): VerifyPaymentResult {
  return { ok: false, rail: "base", code: BASE_RAIL_ERROR_CODES[codeKey], message };
}

function keccak256Hex(taskOutput: string | Uint8Array): string {
  const bytes =
    typeof taskOutput === "string" ? new TextEncoder().encode(taskOutput) : taskOutput;
  const digest = keccak_256(bytes);
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    out += (digest[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function makeSettlementId(agreementId: string, txHash: Hex): string {
  const seed = `${agreementId}:${txHash}`;
  const hash = accordHashV0(seed);
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

function nowIsoUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function shorten(s: string): string {
  return s.length > 14 ? s.slice(0, 10) + "…" : s;
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
