import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSettlementReceipt, type AccordAgreement } from "@accord-protocol/core";
import { MockRailAdapter, type MockPayment } from "../mock.js";

function agreement(overrides: Partial<AccordAgreement["price"]> = {}): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0000000000000000000000",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://buyer" },
    seller: { id: "provider://seller" },
    task: { kind: "summarise", input_ref: "inline:hi", description: "x" },
    price: { amount: "10", currency: "ERG", decimals: 9, ...overrides },
    payment: {
      mode: "note",
      rail: "ergo",
      reserve_ref: "ergo:box:abc",
      deadline: "+480 blocks",
    },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
  };
}

describe("MockRailAdapter — verifyPayment honest mode", () => {
  it("accepts a payment whose value matches the agreement price", async () => {
    const rail = new MockRailAdapter();
    const ag = agreement();
    const result = await rail.verifyPayment({ agreement: ag, payment: { value: "10" } as MockPayment });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rail, "ergo");
      assert.match(result.payment_id, /^mock-[0-9a-f]{16}$/);
    }
  });

  it("accepts a payment that exceeds the agreement price", async () => {
    const rail = new MockRailAdapter();
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { value: "10.5" } as MockPayment,
    });
    assert.equal(result.ok, true);
  });

  it("rejects a payment below the agreement price (INSUFFICIENT_VALUE)", async () => {
    const rail = new MockRailAdapter();
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { value: "9.999" } as MockPayment,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INSUFFICIENT_VALUE");
    }
  });

  it("rejects when payment is missing the value field (MISSING_VALUE)", async () => {
    const rail = new MockRailAdapter();
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { proof: "abc" } as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "MISSING_VALUE");
    }
  });

  it("honours an explicit payment_id override", async () => {
    const rail = new MockRailAdapter();
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { value: "10", payment_id: "tx-explicit-001" } as MockPayment,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payment_id, "tx-explicit-001");
    }
  });
});

describe("MockRailAdapter — verifyPayment failure-injection modes", () => {
  it("always_accept skips the value check", async () => {
    const rail = new MockRailAdapter({ verifyPaymentMode: "always_accept" });
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { proof: "anything" } as never,
    });
    assert.equal(result.ok, true);
  });

  it("always_reject returns INSUFFICIENT_VALUE regardless of input", async () => {
    const rail = new MockRailAdapter({ verifyPaymentMode: "always_reject" });
    const result = await rail.verifyPayment({
      agreement: agreement(),
      payment: { value: "999" } as MockPayment,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INSUFFICIENT_VALUE");
  });

  it("throw mode raises", async () => {
    const rail = new MockRailAdapter({ verifyPaymentMode: "throw" });
    await assert.rejects(() =>
      rail.verifyPayment({
        agreement: agreement(),
        payment: { value: "10" } as MockPayment,
      }),
    );
  });
});

describe("MockRailAdapter — settle", () => {
  it("emits a v0 Settlement Receipt that passes core validation", async () => {
    const rail = new MockRailAdapter();
    const ag = agreement();
    const receipt = await rail.settle({
      agreement: ag,
      payment: { value: "10" } as MockPayment,
    });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.mode, "note_redeemed");
    assert.equal(receipt.rail, "ergo");
  });

  it("derives a deterministic settlement_id from the agreement", async () => {
    const rail = new MockRailAdapter();
    const ag = agreement();
    const a = await rail.settle({ agreement: ag, payment: {} });
    const b = await rail.settle({ agreement: ag, payment: {} });
    assert.equal(a.settlement_id, b.settlement_id);
  });

  it("settle throw mode raises", async () => {
    const rail = new MockRailAdapter({ settleMode: "throw" });
    await assert.rejects(() => rail.settle({ agreement: agreement(), payment: {} }));
  });
});

describe("MockRailAdapter — refund", () => {
  it("emits a Settlement Receipt with status=refunded", async () => {
    const rail = new MockRailAdapter();
    const ag = agreement();
    const receipt = await rail.refund({
      agreement: ag,
      payment: {},
      reason: "deadline_exceeded",
    });
    const v = validateSettlementReceipt(receipt, { agreement: ag });
    assert.equal(v.ok, true, JSON.stringify(v.problems));
    assert.equal(receipt.status, "refunded");
    assert.equal(receipt.mode, "reserve_refunded");
  });
});

describe("MockRailAdapter — rail name override", () => {
  it("uses a custom rail string when provided", () => {
    const rail = new MockRailAdapter({ rail: "rosen" });
    assert.equal(rail.rail, "rosen");
  });
});
