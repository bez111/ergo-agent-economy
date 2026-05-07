import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  validateSettlementReceipt,
  type AccordAgreement,
} from "@accord-protocol/core";
import {
  BASE_RAIL_ERROR_CODES,
  createBaseRailAdapter,
  decimalToBaseUnits,
  type BaseNoteOps,
  type BasePaymentProof,
  type Hex,
  type NoteInfoLite,
} from "../index.js";

const NOTE_ID: Hex = `0x${"a".repeat(64)}`;
const TX_HASH: Hex = `0x${"b".repeat(64)}`;

function keccak256Hex(s: string | Uint8Array): string {
  const buf = typeof s === "string" ? new TextEncoder().encode(s) : s;
  const out = keccak_256(buf);
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
    price: { amount: "0.05", currency: "USDC", decimals: 6 },
    payment: { mode: "pay_before_response", rail: "base", deadline: "+30 seconds" },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
    ...overrides,
  };
}

function noteInfo(overrides: Partial<NoteInfoLite> = {}): NoteInfoLite {
  const taskOutput = '{"word_count":2}';
  return {
    noteId: NOTE_ID,
    issuer: `0x${"1".repeat(40)}` as Hex,
    recipient: `0x${"2".repeat(40)}` as Hex,
    amount: 50_000n,                                // 0.05 USDC = 50_000 base units (decimals=6)
    expiryBlock: 100n,
    currentBlock: 50n,
    isExpired: false,
    redeemed: false,
    exists: true,
    taskHash: ("0x" + keccak256Hex(taskOutput)) as Hex,
    ...overrides,
  };
}

function makeOps(stub: Partial<BaseNoteOps> = {}): BaseNoteOps {
  return {
    network: "base-sepolia",
    checkNote: async (id) => noteInfo({ noteId: id }),
    redeemNote: async () => ({ txHash: `0x${"c".repeat(64)}` as Hex }),
    refundExpired: async () => ({ txHash: `0x${"d".repeat(64)}` as Hex }),
    ...stub,
  };
}

const VALID_PAYMENT: BasePaymentProof = {
  note_id: NOTE_ID,
  task_output: '{"word_count":2}',
  tx_hash: TX_HASH,
};

describe("decimalToBaseUnits (rails-base)", () => {
  it("converts USDC amounts (6 decimals)", () => {
    assert.equal(decimalToBaseUnits("0.05", 6), 50_000n);
    assert.equal(decimalToBaseUnits("1", 6), 1_000_000n);
    assert.equal(decimalToBaseUnits("100", 6), 100_000_000n);
  });
  it("rejects too-precise amounts", () => {
    assert.throws(() => decimalToBaseUnits("0.0000001", 6));
  });
});

describe("createBaseRailAdapter — verifyPayment happy path", () => {
  it("accepts a Note with the right task hash and value", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rail, "base");
      assert.equal(result.payment_id, TX_HASH);                  // tx_hash preferred
      assert.equal(result.details?.note_amount, "50000");
    }
  });

  it("falls back to note_id as payment_id when tx_hash is absent", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_id: NOTE_ID, task_output: '{"word_count":2}' },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payment_id, NOTE_ID);
  });

  it("accepts a Note whose amount exceeds the agreement", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ amount: 100_000n }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
  });
});

describe("createBaseRailAdapter — verifyPayment rejection paths", () => {
  it("INVALID_PAYMENT_SHAPE on non-object payment", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: "x" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("INVALID_PAYMENT_SHAPE on malformed note_id", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_id: "0xshort", task_output: "x" } as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("INVALID_PAYMENT_SHAPE when task_output is missing", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_id: NOTE_ID } as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("NOTE_NOT_FOUND when checkNote throws", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => {
          throw new Error("RPC down");
        },
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.NOTE_NOT_FOUND);
  });

  it("NOTE_NOT_FOUND when note.exists === false", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ exists: false }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.NOTE_NOT_FOUND);
  });

  it("NOTE_ALREADY_REDEEMED when note.redeemed === true", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ redeemed: true }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.NOTE_ALREADY_REDEEMED);
  });

  it("NOTE_EXPIRED when note.isExpired", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ isExpired: true, currentBlock: 200n }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.NOTE_EXPIRED);
  });

  it("CURRENCY_NOT_SUPPORTED when agreement asks for ERG", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const ag = agreement({ price: { amount: "1", currency: "ERG", decimals: 9 } });
    const result = await adapter.verifyPayment({ agreement: ag, payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.CURRENCY_NOT_SUPPORTED);
  });

  it("TASK_HASH_MISSING when note.taskHash is the zero hash", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () =>
          noteInfo({ taskHash: ("0x" + "00".repeat(32)) as Hex }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.TASK_HASH_MISSING);
  });

  it("TASK_HASH_MISMATCH when keccak256(task_output) ≠ note.taskHash", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { ...VALID_PAYMENT, task_output: "wrong output" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.TASK_HASH_MISMATCH);
  });

  it("INSUFFICIENT_VALUE when note.amount < required base units", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ amount: 49_999n }),  // < 50_000
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, BASE_RAIL_ERROR_CODES.INSUFFICIENT_VALUE);
  });
});

describe("createBaseRailAdapter — settle", () => {
  it("emits a v0 Settlement Receipt that passes core validation", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const ag = agreement();
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.rail, "base");
    assert.equal(receipt.mode, "redeemed");
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.tx.network, "base-sepolia");
  });

  it("uses the explicit `network` option when provided", async () => {
    const adapter = createBaseRailAdapter({
      ops: makeOps({ network: "base-sepolia" }),
      network: "mainnet",
    });
    const receipt = await adapter.settle!({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(receipt.tx.network, "mainnet");
  });
});

describe("createBaseRailAdapter — refund", () => {
  it("emits a Settlement Receipt with status=refunded, mode=refund_expired", async () => {
    const adapter = createBaseRailAdapter({ ops: makeOps() });
    const ag = agreement();
    const receipt = await adapter.refund!({
      agreement: ag,
      payment: VALID_PAYMENT,
      reason: "deadline_exceeded",
    });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.status, "refunded");
    assert.equal(receipt.mode, "refund_expired");
  });

  it("throws when ops.refundExpired is not implemented", async () => {
    const ops = makeOps();
    delete (ops as { refundExpired?: unknown }).refundExpired;
    const adapter = createBaseRailAdapter({ ops });
    await assert.rejects(() =>
      adapter.refund!({
        agreement: agreement(),
        payment: VALID_PAYMENT,
        reason: "deadline_exceeded",
      }),
    );
  });
});
