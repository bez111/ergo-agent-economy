import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accordHashV0,
  validateSettlementReceipt,
  type AccordAgreement,
  type AccordVerificationReceipt,
} from "@accord-protocol/core";
import {
  createX402RailAdapter,
  X402_RAIL_ERROR_CODES,
  type X402Facilitator,
  type X402PaymentProof,
} from "../index.js";

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
    payment: { mode: "pay_before_response", rail: "x402", deadline: "+30 seconds" },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "none", dispute_policy: "none" },
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

function makeFacilitator(stub: Partial<X402Facilitator> = {}): X402Facilitator {
  return {
    network: "base-sepolia",
    verify: async () => ({
      ok: true,
      payment_id: "0x" + "a".repeat(64),
      scheme: "exact",
      payer: "0x" + "1".repeat(40),
    }),
    settle: async () => ({
      tx_hash: "0x" + "b".repeat(64),
      block_height: 100,
    }),
    ...stub,
  };
}

const VALID_PAYMENT: X402PaymentProof = {
  x402_payment_payload: "base64encodedstuff",
  scheme: "exact",
};

// ── happy paths ─────────────────────────────────────────────────────────────

describe("createX402RailAdapter — verifyPayment happy path", () => {
  it("accepts a payment when the facilitator returns ok", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rail, "x402");
      assert.match(result.payment_id, /^0x[0-9a-f]{64}$/);
      assert.equal(result.details?.scheme, "exact");
      assert.equal(result.details?.facilitator_network, "base-sepolia");
    }
  });

  it("uses scheme='exact' as the default when buyer omits it", async () => {
    let observedScheme = "";
    const adapter = createX402RailAdapter({
      facilitator: makeFacilitator({
        verify: async (input) => {
          observedScheme = input.scheme ?? "<missing>";
          return { ok: true, payment_id: "0x1", scheme: input.scheme ?? "exact" };
        },
      }),
    });
    await adapter.verifyPayment({
      agreement: agreement(),
      payment: { x402_payment_payload: "p" },     // no scheme
    });
    assert.equal(observedScheme, "exact");
  });
});

// ── rejection paths ─────────────────────────────────────────────────────────

describe("createX402RailAdapter — verifyPayment rejection paths", () => {
  it("INVALID_PAYMENT_SHAPE on non-object payment", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
    const result = await adapter.verifyPayment({ agreement: agreement(), payment: "x" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, X402_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("INVALID_PAYMENT_SHAPE when x402_payment_payload is missing", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: { scheme: "exact" } as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, X402_RAIL_ERROR_CODES.INVALID_PAYMENT_SHAPE);
  });

  it("CURRENCY_NOT_SUPPORTED when agreement asks for ERG", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
    const result = await adapter.verifyPayment({
      agreement: agreement({ price: { amount: "1", currency: "ERG", decimals: 9 } }),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, X402_RAIL_ERROR_CODES.CURRENCY_NOT_SUPPORTED);
  });

  it("FACILITATOR_REJECTED when facilitator returns ok:false", async () => {
    const adapter = createX402RailAdapter({
      facilitator: makeFacilitator({
        verify: async () => ({
          ok: false,
          code: "INSUFFICIENT_VALUE",
          message: "payment amount is below required",
        }),
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, X402_RAIL_ERROR_CODES.FACILITATOR_REJECTED);
      assert.match(result.message, /INSUFFICIENT_VALUE/);
    }
  });

  it("FACILITATOR_UNAVAILABLE when facilitator throws", async () => {
    const adapter = createX402RailAdapter({
      facilitator: makeFacilitator({
        verify: async () => {
          throw new Error("facilitator timeout");
        },
      }),
    });
    const result = await adapter.verifyPayment({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, X402_RAIL_ERROR_CODES.FACILITATOR_UNAVAILABLE);
  });
});

// ── settle ──────────────────────────────────────────────────────────────────

describe("createX402RailAdapter — settle", () => {
  it("emits a paid_before_response Settlement Receipt that passes core validation", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
    const ag = agreement();
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.rail, "x402");
    assert.equal(receipt.mode, "paid_before_response");
    assert.equal(receipt.status, "settled");
    assert.match(receipt.tx.tx_id, /^0x[0-9a-f]{64}$/);
    assert.equal(receipt.tx.block_height, 100);
  });

  it("falls back to payment_id when facilitator.settle is omitted", async () => {
    const adapter = createX402RailAdapter({
      facilitator: {
        network: "base-sepolia",
        verify: async () => ({ ok: true, payment_id: "0x" + "c".repeat(64), scheme: "exact" }),
      },
    });
    const ag = agreement();
    const receipt = await adapter.settle!({ agreement: ag, payment: VALID_PAYMENT });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.tx.tx_id, "0x" + "c".repeat(64));
    assert.equal(receipt.tx.block_height, undefined);
  });

  it("falls back when facilitator.settle throws (settles using payment_id as tx_id)", async () => {
    const adapter = createX402RailAdapter({
      facilitator: makeFacilitator({
        settle: async () => {
          throw new Error("facilitator settle 503");
        },
      }),
    });
    const receipt = await adapter.settle!({ agreement: agreement(), payment: VALID_PAYMENT });
    assert.equal(receipt.status, "settled");
    assert.match(receipt.tx.tx_id, /^0x[0-9a-f]{64}$/);
  });

  it("carries verification_receipts when verification was supplied", async () => {
    const adapter = createX402RailAdapter({ facilitator: makeFacilitator() });
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
    const adapter = createX402RailAdapter({
      facilitator: makeFacilitator(),
      network: "mainnet",
    });
    const receipt = await adapter.settle!({
      agreement: agreement(),
      payment: VALID_PAYMENT,
    });
    assert.equal(receipt.tx.network, "mainnet");
  });
});
