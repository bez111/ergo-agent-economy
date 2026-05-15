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
  createRosenRailAdapter,
  ROSEN_RAIL_ERROR_CODES,
  type RosenNoteInfoLite,
  type RosenNoteOps,
  type RosenPaymentProof,
  type RosenTokenRegistry,
} from "../index.js";

const NOTE_BOX_ID = "a".repeat(64);
const RESERVE_BOX_ID = "b".repeat(64);
const RS_USDT_TOKEN = "c".repeat(64);
const RS_BTC_TOKEN = "d".repeat(64);

function blake2b256Hex(s: string | Uint8Array): string {
  const buf = typeof s === "string" ? new TextEncoder().encode(s) : s;
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
    price: { amount: "0.05", currency: "rsUSDT", decimals: 6 },
    payment: {
      mode: "note",
      rail: "rosen",
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

function noteInfo(overrides: Partial<RosenNoteInfoLite> = {}): RosenNoteInfoLite {
  const taskOutput = '{"word_count":2}';
  return {
    boxId: NOTE_BOX_ID,
    value: 1_000_000n,                  // ERG dust for the box itself
    expiryBlock: 1_000_000,
    currentBlock: 999_500,
    isExpired: false,
    reserveBoxId: RESERVE_BOX_ID,
    taskHash: blake2b256Hex(taskOutput),
    tokens: [{ tokenId: RS_USDT_TOKEN, amount: 50_000n }],   // 0.05 rsUSDT @ 6 decimals
    ...overrides,
  };
}

const TOKENS: RosenTokenRegistry = {
  rsUSDT: { tokenId: RS_USDT_TOKEN, decimals: 6 },
  rsBTC:  { tokenId: RS_BTC_TOKEN,  decimals: 8 },
};

function makeOps(stub: Partial<RosenNoteOps> = {}): RosenNoteOps {
  return {
    network: "testnet",
    checkNote: async (id: string) => noteInfo({ boxId: id }),
    redeemNote: async () => ({ txId: "e".repeat(64), submitted: true }),
    ...stub,
  };
}

const VALID_PAYMENT: RosenPaymentProof = {
  note_box_id: NOTE_BOX_ID,
  task_output: '{"word_count":2}',
};

// ── happy paths ─────────────────────────────────────────────────────────────

describe("createRosenRailAdapter — verifyPayment happy path", () => {
  it("accepts an rsUSDT Note with the right reserve, task hash, and token amount", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rail, "rosen");
      assert.equal(result.payment_id, NOTE_BOX_ID);
      assert.equal(result.details?.currency, "rsUSDT");
      assert.equal(result.details?.token_amount, "50000");
    }
  });

  it("accepts an rsBTC Note when the registry has rsBTC and amount checks out", async () => {
    const ops = makeOps({
      checkNote: async () =>
        noteInfo({
          tokens: [{ tokenId: RS_BTC_TOKEN, amount: 1_000_000n }],
        }),
    });
    const adapter = createRosenRailAdapter({ ops, tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement({
        price: { amount: "0.001", currency: "rsBTC", decimals: 8 },     // 0.001 rsBTC = 100_000 base units
      }),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
  });

  it("ignores extra tokens in the Note that aren't the agreement's currency", async () => {
    const ops = makeOps({
      checkNote: async () =>
        noteInfo({
          tokens: [
            { tokenId: "f".repeat(64), amount: 999_999n }, // junk
            { tokenId: RS_USDT_TOKEN, amount: 50_000n },
          ],
        }),
    });
    const adapter = createRosenRailAdapter({ ops, tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
  });
});

// ── rejection paths ─────────────────────────────────────────────────────────

describe("createRosenRailAdapter — verifyPayment rejection paths", () => {
  it("INVALID_PAYMENT_SHAPE on bad note_box_id", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { note_box_id: "abc", task_output: "x" } as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("CURRENCY_NOT_SUPPORTED when agreement asks for ERG", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement({ price: { amount: "1", currency: "ERG", decimals: 9 } }),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.CURRENCY_NOT_SUPPORTED);
  });

  it("CURRENCY_NOT_REGISTERED when registry doesn't have the requested currency", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: { rsBTC: TOKENS.rsBTC! } });
    const result = await adapter.verifyPayment({
      agreement: agreement(), // asks for rsUSDT
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.CURRENCY_NOT_REGISTERED);
  });

  it("INVALID_PAYMENT_SHAPE when registry decimals ≠ agreement decimals", async () => {
    const adapter = createRosenRailAdapter({
      ops: makeOps(),
      tokens: { rsUSDT: { tokenId: RS_USDT_TOKEN, decimals: 18 } },
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("NOTE_NOT_FOUND when checkNote throws", async () => {
    const adapter = createRosenRailAdapter({
      ops: makeOps({
        checkNote: async () => {
          throw new Error("api 404");
        },
      }),
      tokens: TOKENS,
    });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.NOTE_NOT_FOUND);
  });

  it("NOTE_EXPIRED when the Note is past its deadline", async () => {
    const adapter = createRosenRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ isExpired: true, currentBlock: 1_000_001 }),
      }),
      tokens: TOKENS,
    });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.NOTE_EXPIRED);
  });

  it("RESERVE_MISMATCH when R4 doesn't match agreement.payment.reserve_ref", async () => {
    const adapter = createRosenRailAdapter({
      ops: makeOps({
        checkNote: async () => noteInfo({ reserveBoxId: "f".repeat(64) }),
      }),
      tokens: TOKENS,
    });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.RESERVE_MISMATCH);
  });

  it("TASK_HASH_MISMATCH when blake2b256(task_output) ≠ R6", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { ...VALID_PAYMENT, task_output: "wrong" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.TASK_HASH_MISMATCH);
  });

  it("TOKEN_NOT_PRESENT when the Note doesn't carry the agreement's currency token", async () => {
    const ops = makeOps({
      checkNote: async () =>
        noteInfo({ tokens: [{ tokenId: "9".repeat(64), amount: 100n }] }),
    });
    const adapter = createRosenRailAdapter({ ops, tokens: TOKENS });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.TOKEN_NOT_PRESENT);
  });

  it("INSUFFICIENT_VALUE when the carried token amount < required base units", async () => {
    const ops = makeOps({
      checkNote: async () => noteInfo({ tokens: [{ tokenId: RS_USDT_TOKEN, amount: 49_999n }] }),
    });
    const adapter = createRosenRailAdapter({ ops, tokens: TOKENS });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, ROSEN_RAIL_ERROR_CODES.INSUFFICIENT_VALUE);
  });
});

// ── settle ──────────────────────────────────────────────────────────────────

describe("createRosenRailAdapter — settle", () => {
  it("emits a v0 Settlement Receipt that passes core validation", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const ag = agreement();
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.rail, "rosen");
    assert.equal(receipt.mode, "note_redeemed");
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.currency, "rsUSDT");
    assert.equal(receipt.tx.box_id, NOTE_BOX_ID);
  });

  it("emits status=pending when redeemNote returns submitted: false", async () => {
    const adapter = createRosenRailAdapter({
      ops: makeOps({
        redeemNote: async () => ({ submitted: false }),
      }),
      tokens: TOKENS,
    });
    const receipt = await adapter.settle!({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(receipt.status, "pending");
  });

  it("carries verification_receipts when verification was supplied", async () => {
    const adapter = createRosenRailAdapter({ ops: makeOps(), tokens: TOKENS });
    const ag = agreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://test" },
    });
    const verification = verificationReceipt(ag);
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT, verification });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.deepEqual(receipt.verification_receipts, [verification.receipt_id]);
  });
});
