#!/usr/bin/env node
import {
  accordHashV0,
  validateAgreement,
  validateSettlementReceipt,
  validateVerificationReceipt,
} from "@accord-protocol/core";
import { createRosenRailAdapter } from "@accord-protocol/rails-rosen";
import { blake2b } from "@noble/hashes/blake2";

const TASK_OUTPUT = '{"word_count":2,"schema":"rosen.stub.response.v0"}';
const NOTE_BOX_ID = "a".repeat(64);
const RESERVE_BOX_ID = "b".repeat(64);
const RS_USDT_TOKEN_ID = "c".repeat(64);
const SETTLEMENT_TX_ID = "e".repeat(64);
const EXPECTED_BASE_UNITS = 50_000n;

const TOKEN_MAP = {
  rsUSDT: { tokenId: RS_USDT_TOKEN_ID, decimals: 6 },
};
const tokenMapSource = JSON.stringify(TOKEN_MAP);
const tokenMapHash = "blake2b256:0x" + blake2b256Hex(tokenMapSource);

const AGREEMENT = {
  type: "accord.agreement.v0",
  version: "v0",
  agreement_id: "acc_rosen_stub_20260515",
  created_at: "2026-05-15T20:58:00Z",
  buyer: { id: "agent://rosen-stub-buyer" },
  seller: { id: "provider://accord-rosen-stub-seller" },
  task: {
    kind: "wrapped_token_paid_tool",
    input_ref: "stub://rosen/rsusdt-tool",
    description: "Validate a Rosen wrapped-token Accord Note against an explicit TokenMap stub.",
    output_schema: "rosen.stub.response.v0",
  },
  price: { amount: "0.05", currency: "rsUSDT", decimals: 6 },
  payment: {
    mode: "note",
    rail: "rosen",
    reserve_ref: `ergo:box:${RESERVE_BOX_ID}`,
    deadline: "+480 blocks",
  },
  verification: {
    required: true,
    method: "verifier_receipt",
    verifier: "verifier://rosen-stub-v0",
    evidence_required: ["schema_valid", "tokenmap_valid", "amount_valid"],
  },
  settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
  metadata: {
    labels: ["pilot", "rosen", "stub"],
    tokenmap_hash: tokenMapHash,
  },
};

const payment = {
  note_box_id: NOTE_BOX_ID,
  task_output: TASK_OUTPUT,
  receiver_address: "9fRosenStubReceiverAddress",
};

const opsCalls = [];
const ops = {
  network: "testnet",
  async checkNote(noteBoxId) {
    opsCalls.push({ method: "checkNote", noteBoxId });
    return {
      boxId: noteBoxId,
      value: 1_000_000n,
      expiryBlock: 1_000_000,
      currentBlock: 999_500,
      isExpired: false,
      reserveBoxId: RESERVE_BOX_ID,
      taskHash: blake2b256Hex(TASK_OUTPUT),
      tokens: [
        { tokenId: "f".repeat(64), amount: 123n },
        { tokenId: RS_USDT_TOKEN_ID, amount: EXPECTED_BASE_UNITS },
      ],
    };
  },
  async redeemNote(opts) {
    opsCalls.push({
      method: "redeemNote",
      noteBoxId: opts.noteBoxId,
      taskOutputHash: "blake2b256:0x" + blake2b256Hex(opts.taskOutput ?? ""),
      receiverAddress: opts.receiverAddress ?? null,
    });
    return { txId: SETTLEMENT_TX_ID, submitted: true };
  },
};

const rail = createRosenRailAdapter({ ops, tokens: TOKEN_MAP, network: "testnet" });
const agreementHash = "blake2b256:0x" + accordHashV0(AGREEMENT);
const verificationReceipt = {
  type: "accord.verification_receipt.v0",
  version: "v0",
  receipt_id: "vr_" + toBase32(accordHashV0(`vr:${AGREEMENT.agreement_id}`), 26),
  agreement_id: AGREEMENT.agreement_id,
  agreement_hash: agreementHash,
  verifier: { id: "verifier://rosen-stub-v0" },
  result: "accepted",
  evidence: {
    output_hash: "blake2b256:0x" + accordHashV0(TASK_OUTPUT),
    output_ref: "stub://rosen/rsusdt-tool",
    schema: "rosen.stub.response.v0",
  },
  checks: [
    { name: "schema_valid", result: "pass" },
    { name: "tokenmap_valid", result: "pass", detail: tokenMapHash },
    { name: "amount_valid", result: "pass", detail: "0.05 rsUSDT = 50000 base units" },
  ],
  created_at: "2026-05-15T20:58:10Z",
  signature: {
    scheme: "ed25519",
    public_key: "0xstub-rosen-verifier-public-key",
    signature: "0xstub-rosen-verifier-signature",
  },
};

const verifyResult = await rail.verifyPayment({ agreement: AGREEMENT, payment });
if (!verifyResult.ok) {
  throw new Error(`expected verifyPayment ok, got ${verifyResult.code}: ${verifyResult.message}`);
}

const settlementReceipt = await rail.settle({
  agreement: AGREEMENT,
  payment,
  verification: verificationReceipt,
});

const wrongTokenMapRail = createRosenRailAdapter({
  ops,
  tokens: { rsUSDT: { tokenId: "d".repeat(64), decimals: 6 } },
  network: "testnet",
});
const tokenMismatch = await wrongTokenMapRail.verifyPayment({ agreement: AGREEMENT, payment });
if (tokenMismatch.ok) {
  throw new Error("wrong TokenMap unexpectedly passed");
}

const agreementValidation = validateAgreement(AGREEMENT);
const verificationValidation = validateVerificationReceipt(verificationReceipt, {
  agreement: AGREEMENT,
});
const settlementValidation = validateSettlementReceipt(settlementReceipt, {
  agreement: AGREEMENT,
});

if (!agreementValidation.ok || !verificationValidation.ok || !settlementValidation.ok) {
  throw new Error(
    JSON.stringify(
      {
        agreement: agreementValidation.problems,
        verification: verificationValidation.problems,
        settlement: settlementValidation.problems,
      },
      null,
      2,
    ),
  );
}

if (settlementReceipt.verification_receipts?.[0] !== verificationReceipt.receipt_id) {
  throw new Error("settlement receipt did not reference the verification receipt");
}

const evidence = {
  ok: true,
  agreement_id: AGREEMENT.agreement_id,
  agreement_hash: agreementHash,
  verification_receipt_id: verificationReceipt.receipt_id,
  settlement_receipt_id: settlementReceipt.settlement_id,
  settlement_tx_id: settlementReceipt.tx.tx_id,
  note_box_id: NOTE_BOX_ID,
  reserve_box_id: RESERVE_BOX_ID,
  network: settlementReceipt.tx.network,
  tokenmap: {
    source: TOKEN_MAP,
    hash: tokenMapHash,
    symbol: "rsUSDT",
    token_id: RS_USDT_TOKEN_ID,
    decimals: 6,
  },
  accounting: {
    price: AGREEMENT.price.amount,
    currency: AGREEMENT.price.currency,
    decimals: AGREEMENT.price.decimals,
    expected_base_units: EXPECTED_BASE_UNITS.toString(),
    actual_token_amount: verifyResult.details.token_amount,
    token_id: verifyResult.details.token_id,
    matched: verifyResult.details.token_amount === EXPECTED_BASE_UNITS.toString(),
  },
  bridge_assumptions: {
    real: [],
    stubbed: [
      "TokenMap source",
      "Rosen wrapped-token Note box",
      "redeemNote settlement tx id",
    ],
    unavailable: ["live Rosen testnet bridge/liquidity/watcher evidence"],
  },
  negative_checks: {
    wrong_tokenmap_rejected: true,
    wrong_tokenmap_code: tokenMismatch.code,
  },
  ops_calls: opsCalls,
  receipt_checks: {
    agreement_valid: agreementValidation.ok,
    verification_receipt_valid: verificationValidation.ok,
    settlement_receipt_valid: settlementValidation.ok,
    settlement_references_verification:
      settlementReceipt.verification_receipts?.[0] === verificationReceipt.receipt_id,
  },
};

console.log(JSON.stringify(evidence, null, 2));

function blake2b256Hex(input) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = blake2b(bytes, { dkLen: 32 });
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    out += digest[i].toString(16).padStart(2, "0");
  }
  return out;
}

function toBase32(hex, length) {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; out.length < length; i = (i + 1) % hex.length) {
    value = (value << 4) | parseInt(hex[i], 16);
    bits += 4;
    if (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >> bits) & 0x1f];
    }
  }
  return out;
}
