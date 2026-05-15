import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blake2b } from "@noble/hashes/blake2";
import {
  accordHashV0,
  validateSettlementReceipt,
  type AccordAgreement,
  type AccordVerificationReceipt,
} from "@accord-protocol/core";
import {
  createErgoRailAdapter,
  decimalToBaseUnits,
  ERGO_RAIL_ERROR_CODES,
  type ErgoNoteOps,
  type ErgoPaymentProof,
  type NoteInfoLite,
} from "../index.js";

// ── helpers ─────────────────────────────────────────────────────────────────

const NOTE_BOX_ID = "a".repeat(64);
const RESERVE_BOX_ID = "b".repeat(64);

function blake2b256Hex(bytes: string | Uint8Array): string {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const out = blake2b(buf, { dkLen: 32 });
  let hex = "";
  for (let i = 0; i < out.length; i++) hex += (out[i] as number).toString(16).padStart(2, "0");
  return hex;
}

function agreement(overrides: Partial<AccordAgreement> = {}): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0000000000000000000000",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://buyer" },
    seller: { id: "provider://seller" },
    task: { kind: "summarise", input_ref: "inline:hi", description: "x" },
    price: { amount: "0.001", currency: "ERG", decimals: 9 },
    payment: {
      mode: "note",
      rail: "ergo",
      reserve_ref: `ergo:box:${RESERVE_BOX_ID}`,
      deadline: "+480 blocks",
    },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
    ...overrides,
  };
}

function verificationReceipt(ag: AccordAgreement): AccordVerificationReceipt {
  return {
    type: "accord.verification_receipt.v0",
    version: "v0",
    receipt_id: "vr_01HX0000000000000000000000",
    agreement_id: ag.agreement_id,
    agreement_hash: "blake2b256:0x" + accordHashV0(ag),
    verifier: { id: "verifier://test" },
    result: "accepted",
    evidence: { output_hash: "blake2b256:0x" + "1".repeat(64) },
    created_at: "2026-05-07T00:00:10Z",
    signature: { scheme: "ed25519", public_key: "0xaa", signature: "0xbb" },
  };
}

function noteInfo(overrides: Partial<NoteInfoLite> = {}): NoteInfoLite {
  const taskOutput = '{"word_count":2}';
  return {
    boxId: NOTE_BOX_ID,
    value: 1_000_000n,                 // 0.001 ERG in nanoERG = 1_000_000
    expiryBlock: 1_000_000,
    currentBlock: 999_500,
    isExpired: false,
    reserveBoxId: RESERVE_BOX_ID,
    taskHash: blake2b256Hex(taskOutput),
    ...overrides,
  };
}

function makeOps(stub: Partial<ErgoNoteOps> = {}): ErgoNoteOps {
  return {
    network: "testnet",
    checkNote: async (id: string) => noteInfo({ boxId: id }),
    redeemNote: async () => ({ txId: "c".repeat(64), submitted: true }),
    ...stub,
  };
}

const VALID_PAYMENT: ErgoPaymentProof = {
  note_box_id: NOTE_BOX_ID,
  task_output: '{"word_count":2}',
};

// ── decimalToBaseUnits ───────────────────────────────────────────────────────

describe("decimalToBaseUnits", () => {
  it("converts integer amounts", () => {
    assert.equal(decimalToBaseUnits("25", 9), 25_000_000_000n);
    assert.equal(decimalToBaseUnits("0", 9), 0n);
  });
  it("converts fractional amounts", () => {
    assert.equal(decimalToBaseUnits("0.001", 9), 1_000_000n);
    assert.equal(decimalToBaseUnits("1.5", 6), 1_500_000n);
  });
  it("rejects too-precise amounts (no silent truncation)", () => {
    assert.throws(() => decimalToBaseUnits("0.0000000001", 9));
  });
  it("rejects malformed strings", () => {
    assert.throws(() => decimalToBaseUnits("01", 9));    // leading zero
    assert.throws(() => decimalToBaseUnits("1.", 9));    // trailing dot
    assert.throws(() => decimalToBaseUnits("-1", 9));    // sign
    assert.throws(() => decimalToBaseUnits("abc", 9));
  });
});

// ── verifyPayment — happy path ───────────────────────────────────────────────

describe("createErgoRailAdapter — verifyPayment happy path", () => {
  it("accepts a Note with the right reserve, task hash, and value", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rail, "ergo");
      assert.equal(result.payment_id, NOTE_BOX_ID);
      assert.equal(result.details?.note_value_nano_erg, "1000000");
    }
  });

  it("accepts a bare hex reserve_ref (no rail prefix)", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const ag = agreement({
      payment: {
        mode: "note",
        rail: "ergo",
        reserve_ref: RESERVE_BOX_ID,
        deadline: "+480 blocks",
      },
    });
    const result = await adapter.verifyPayment({ agreement: ag, payment: VALID_PAYMENT });
    assert.equal(result.ok, true);
  });

  it("accepts a Note whose value exceeds the agreement price", async () => {
    const ops = makeOps({
      checkNote: async () => noteInfo({ value: 5_000_000n }),
    });
    const adapter = createErgoRailAdapter({ ops });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
  });
});

// ── verifyPayment — rejection paths ─────────────────────────────────────────

describe("createErgoRailAdapter — verifyPayment rejection paths", () => {
  it("INVALID_PAYMENT_SHAPE when payment is not an object", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: "string",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("INVALID_PAYMENT_SHAPE when note_box_id is wrong length", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_box_id: "abc", task_output: "x" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("INVALID_PAYMENT_SHAPE when task_output is missing", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_box_id: NOTE_BOX_ID },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("NOTE_NOT_FOUND when checkNote throws", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        checkNote: async () => {
          throw new Error("api 404");
        },
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.NOTE_NOT_FOUND);
  });

  it("NOTE_EXPIRED when the Note is past its deadline", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ isExpired: true, currentBlock: 1_000_001 }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.NOTE_EXPIRED);
  });

  it("RESERVE_MISMATCH when the Note's R4 ≠ agreement.payment.reserve_ref", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ reserveBoxId: "f".repeat(64) }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.RESERVE_MISMATCH);
  });

  it("TASK_HASH_MISSING when the Note has no R6", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ taskHash: undefined }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.TASK_HASH_MISSING);
  });

  it("TASK_HASH_MISMATCH when blake2b256(task_output) ≠ R6", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { ...VALID_PAYMENT, task_output: "different output" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.TASK_HASH_MISMATCH);
  });

  it("INSUFFICIENT_VALUE when the Note's value < required nanoERG", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ value: 999_999n }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(), // requires 1_000_000 nanoERG
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.INSUFFICIENT_VALUE);
  });

  it("CURRENCY_MISMATCH when the agreement asks for a non-ERG currency", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const ag = agreement({
      price: { amount: "1", currency: "USDC", decimals: 6 },
    });
    const result = await adapter.verifyPayment({ agreement: ag, payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ERGO_RAIL_ERROR_CODES.CURRENCY_MISMATCH);
  });
});

// ── settle ──────────────────────────────────────────────────────────────────

describe("createErgoRailAdapter — settle", () => {
  it("emits a v0 Settlement Receipt that passes core validation", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const ag = agreement();
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.rail, "ergo");
    assert.equal(receipt.mode, "note_redeemed");
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.amount, "0.001");
    assert.equal(receipt.tx.box_id, NOTE_BOX_ID);
    assert.equal(receipt.tx.network, "testnet");
  });

  it("emits status=pending when redeemNote returns submitted: false", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        redeemNote: async () => ({ submitted: false }),
      }),
    });
    const receipt = await adapter.settle!({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(receipt.status, "pending");
  });

  it("propagates the txId into the receipt", async () => {
    const txHash = "deadbeef".repeat(8);
    const adapter = createErgoRailAdapter({
      ops: makeOps({
        redeemNote: async () => ({ txId: txHash, submitted: true }),
      }),
    });
    const receipt = await adapter.settle!({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(receipt.tx.tx_id, txHash);
  });

  it("carries verification_receipts when verification was supplied", async () => {
    const adapter = createErgoRailAdapter({ ops: makeOps() });
    const ag = agreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://test" },
    });
    const verification = verificationReceipt(ag);
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT, verification });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.deepEqual(receipt.verification_receipts, [verification.receipt_id]);
  });

  it("uses the explicit `network` option when provided", async () => {
    const adapter = createErgoRailAdapter({
      ops: makeOps({ network: "testnet" }),
      network: "mainnet",
    });
    const receipt = await adapter.settle!({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(receipt.tx.network, "mainnet");
  });
});
