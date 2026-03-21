import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PolicyEngine } from "../policy.js";
import { ErgoAgentPayError } from "../types.js";
import type { PayContext, PayResult } from "../types.js";

function makeCtx(value: bigint, overrides: Partial<PayContext> = {}): PayContext {
  return {
    to: "3WxyzABC",
    value,
    sessionSpend: 0n,
    timestamp: Date.now(),
    ...overrides,
  };
}

const DUMMY_RESULT: PayResult = {
  unsignedTx: {},
  submitted: false,
};

// ── maxSinglePayment ──────────────────────────────────────────────────────────

describe("maxSinglePayment", () => {
  it("allows payment equal to limit", async () => {
    const engine = new PolicyEngine({ maxSinglePayment: 1_000_000n });
    await assert.doesNotReject(() => engine.checkBefore(makeCtx(1_000_000n)));
  });

  it("allows payment below limit", async () => {
    const engine = new PolicyEngine({ maxSinglePayment: 1_000_000n });
    await assert.doesNotReject(() => engine.checkBefore(makeCtx(500_000n)));
  });

  it("rejects payment above limit", async () => {
    const engine = new PolicyEngine({ maxSinglePayment: 1_000_000n });
    await assert.rejects(
      () => engine.checkBefore(makeCtx(1_000_001n)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "POLICY_REJECTED"
    );
  });

  it("allows any payment when no limit set", async () => {
    const engine = new PolicyEngine({});
    await assert.doesNotReject(() => engine.checkBefore(makeCtx(999_999_999n)));
  });
});

// ── maxSessionSpend ───────────────────────────────────────────────────────────

describe("maxSessionSpend", () => {
  it("tracks cumulative spend across payments", async () => {
    const engine = new PolicyEngine({ maxSessionSpend: 3_000_000n });
    const ctx1 = makeCtx(1_000_000n);
    const ctx2 = makeCtx(1_000_000n);

    await engine.checkBefore(ctx1);
    await engine.recordAfter(ctx1, DUMMY_RESULT);
    await engine.checkBefore(ctx2);
    await engine.recordAfter(ctx2, DUMMY_RESULT);

    assert.equal(engine.totalSessionSpend, 2_000_000n);
  });

  it("blocks payment that would exceed session limit", async () => {
    const engine = new PolicyEngine({ maxSessionSpend: 2_000_000n });

    await engine.checkBefore(makeCtx(1_500_000n));
    await engine.recordAfter(makeCtx(1_500_000n), DUMMY_RESULT);

    await assert.rejects(
      () => engine.checkBefore(makeCtx(1_000_000n)), // 1.5M + 1M = 2.5M > 2M
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "POLICY_REJECTED"
    );
  });

  it("resets session spend on resetSession()", async () => {
    const engine = new PolicyEngine({ maxSessionSpend: 1_000_000n });
    await engine.recordAfter(makeCtx(900_000n), DUMMY_RESULT);
    assert.equal(engine.totalSessionSpend, 900_000n);

    engine.resetSession();
    assert.equal(engine.totalSessionSpend, 0n);

    // should pass again after reset
    await assert.doesNotReject(() => engine.checkBefore(makeCtx(900_000n)));
  });
});

// ── requireApprovalAbove ──────────────────────────────────────────────────────

describe("requireApprovalAbove", () => {
  it("does not call approvalFn below threshold", async () => {
    let called = false;
    const engine = new PolicyEngine({
      requireApprovalAbove: 5_000_000n,
      approvalFn: async () => { called = true; return true; },
    });

    await engine.checkBefore(makeCtx(4_999_999n));
    assert.equal(called, false);
  });

  it("calls approvalFn above threshold and allows when approved", async () => {
    let called = false;
    const engine = new PolicyEngine({
      requireApprovalAbove: 5_000_000n,
      approvalFn: async () => { called = true; return true; },
    });

    await assert.doesNotReject(() => engine.checkBefore(makeCtx(5_000_001n)));
    assert.equal(called, true);
  });

  it("throws APPROVAL_DENIED when approvalFn returns false", async () => {
    const engine = new PolicyEngine({
      requireApprovalAbove: 5_000_000n,
      approvalFn: async () => false,
    });

    await assert.rejects(
      () => engine.checkBefore(makeCtx(5_000_001n)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "APPROVAL_DENIED"
    );
  });

  it("throws APPROVAL_DENIED when no approvalFn configured", async () => {
    const engine = new PolicyEngine({ requireApprovalAbove: 1_000_000n });

    await assert.rejects(
      () => engine.checkBefore(makeCtx(1_000_001n)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "APPROVAL_DENIED"
    );
  });
});

// ── beforePay hook ────────────────────────────────────────────────────────────

describe("beforePay hook", () => {
  it("allows payment when hook returns true", async () => {
    const engine = new PolicyEngine({ beforePay: async () => true });
    await assert.doesNotReject(() => engine.checkBefore(makeCtx(1_000_000n)));
  });

  it("rejects payment when hook returns false", async () => {
    const engine = new PolicyEngine({ beforePay: async () => false });
    await assert.rejects(
      () => engine.checkBefore(makeCtx(1_000_000n)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "POLICY_REJECTED"
    );
  });

  it("receives correct ctx in hook", async () => {
    let receivedCtx: PayContext | null = null;
    const engine = new PolicyEngine({
      beforePay: async (ctx) => { receivedCtx = ctx; return true; },
    });

    await engine.checkBefore(makeCtx(42_000n, { to: "addr123", memo: "test" }));
    assert.ok(receivedCtx !== null);
    assert.equal((receivedCtx as PayContext).value, 42_000n);
    assert.equal((receivedCtx as PayContext).to, "addr123");
    assert.equal((receivedCtx as PayContext).memo, "test");
  });

  it("can block specific addresses", async () => {
    const BLACKLIST = "banned-address";
    const engine = new PolicyEngine({
      beforePay: async (ctx) => ctx.to !== BLACKLIST,
    });

    await assert.doesNotReject(() => engine.checkBefore(makeCtx(1_000n, { to: "good-address" })));
    await assert.rejects(
      () => engine.checkBefore(makeCtx(1_000n, { to: BLACKLIST })),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "POLICY_REJECTED"
    );
  });
});

// ── afterPay hook ─────────────────────────────────────────────────────────────

describe("afterPay hook", () => {
  it("is called after recordAfter", async () => {
    let called = false;
    const engine = new PolicyEngine({
      afterPay: async () => { called = true; },
    });

    await engine.recordAfter(makeCtx(1_000_000n), DUMMY_RESULT);
    assert.equal(called, true);
  });

  it("receives ctx and result", async () => {
    let capturedCtx: PayContext | null = null;
    let capturedResult: PayResult | null = null;

    const engine = new PolicyEngine({
      afterPay: async (ctx, result) => {
        capturedCtx = ctx;
        capturedResult = result;
      },
    });

    const ctx = makeCtx(500_000n);
    await engine.recordAfter(ctx, DUMMY_RESULT);
    assert.equal((capturedCtx as unknown as PayContext)?.value, 500_000n);
    assert.equal(capturedResult, DUMMY_RESULT);
  });

  it("session spend increments even if afterPay throws", async () => {
    const engine = new PolicyEngine({
      afterPay: async () => { throw new Error("afterPay error"); },
    });

    try {
      await engine.recordAfter(makeCtx(1_000_000n), DUMMY_RESULT);
    } catch {
      // expected
    }
    // spend should still be recorded
    assert.equal(engine.totalSessionSpend, 1_000_000n);
  });
});

// ── combined limits ───────────────────────────────────────────────────────────

describe("combined limits", () => {
  it("maxSinglePayment checked before maxSessionSpend", async () => {
    const engine = new PolicyEngine({
      maxSinglePayment: 1_000_000n,
      maxSessionSpend: 10_000_000n,
    });

    // Should fail on single payment limit, not session limit
    await assert.rejects(
      () => engine.checkBefore(makeCtx(2_000_000n)),
      (e: unknown) =>
        e instanceof ErgoAgentPayError &&
        e.code === "POLICY_REJECTED" &&
        (e.message.includes("single-payment"))
    );
  });

  it("no limits = no restriction", async () => {
    const engine = new PolicyEngine();
    for (let i = 0; i < 5; i++) {
      await engine.checkBefore(makeCtx(1_000_000_000n));
      await engine.recordAfter(makeCtx(1_000_000_000n), DUMMY_RESULT);
    }
    assert.equal(engine.totalSessionSpend, 5_000_000_000n);
  });
});
