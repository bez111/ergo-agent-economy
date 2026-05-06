import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PolicyEngine } from "../policy.js";
import { ErgoAgentPayError } from "../types.js";
import type { PayContext, PayResult, AuditLogEvent } from "../types.js";

function ctx(value: bigint, to = "9XAlpha", overrides: Partial<PayContext> = {}): PayContext {
  return {
    to,
    value,
    sessionSpend: 0n,
    timestamp: 0,
    ...overrides,
  };
}

const RESULT: PayResult = { unsignedTx: {}, submitted: false };

// ── recipientBlocklist ───────────────────────────────────────────────────────

describe("recipientBlocklist", () => {
  it("rejects payments to blocklisted addresses", async () => {
    const engine = new PolicyEngine({ recipientBlocklist: ["9XBad"] });
    await assert.rejects(
      () => engine.checkBefore(ctx(1n, "9XBad")),
      (e: unknown) =>
        e instanceof ErgoAgentPayError &&
        e.code === "POLICY_REJECTED" &&
        /blocklist/.test(e.message)
    );
  });

  it("allows non-blocklisted addresses", async () => {
    const engine = new PolicyEngine({ recipientBlocklist: ["9XBad"] });
    await assert.doesNotReject(() => engine.checkBefore(ctx(1n, "9XGood")));
  });

  it("works with Set input", async () => {
    const engine = new PolicyEngine({
      recipientBlocklist: new Set(["9XBad"]),
    });
    await assert.rejects(() => engine.checkBefore(ctx(1n, "9XBad")));
  });

  it("blocklist beats allowlist when both contain the same address", async () => {
    const engine = new PolicyEngine({
      recipientAllowlist: ["9XOnList"],
      recipientBlocklist: ["9XOnList"],
    });
    await assert.rejects(
      () => engine.checkBefore(ctx(1n, "9XOnList")),
      (e: unknown) => e instanceof ErgoAgentPayError && /blocklist/.test(e.message)
    );
  });
});

// ── recipientAllowlist ───────────────────────────────────────────────────────

describe("recipientAllowlist", () => {
  it("allows listed addresses", async () => {
    const engine = new PolicyEngine({ recipientAllowlist: ["9XGood"] });
    await assert.doesNotReject(() => engine.checkBefore(ctx(1n, "9XGood")));
  });

  it("rejects unlisted addresses", async () => {
    const engine = new PolicyEngine({ recipientAllowlist: ["9XGood"] });
    await assert.rejects(
      () => engine.checkBefore(ctx(1n, "9XStranger")),
      (e: unknown) =>
        e instanceof ErgoAgentPayError &&
        e.code === "POLICY_REJECTED" &&
        /allowlist/.test(e.message)
    );
  });

  it("absent allowlist means no restriction", async () => {
    const engine = new PolicyEngine({});
    await assert.doesNotReject(() => engine.checkBefore(ctx(1n, "9XAnyone")));
  });

  it("works with Set input", async () => {
    const engine = new PolicyEngine({
      recipientAllowlist: new Set(["9XGood"]),
    });
    await assert.doesNotReject(() => engine.checkBefore(ctx(1n, "9XGood")));
    await assert.rejects(() => engine.checkBefore(ctx(1n, "9XStranger")));
  });
});

// ── perRecipientCap ──────────────────────────────────────────────────────────

describe("perRecipientCap", () => {
  it("rejects when over the per-recipient cap", async () => {
    const engine = new PolicyEngine({
      perRecipientCap: { "9XAlpha": 100n },
    });
    await assert.rejects(
      () => engine.checkBefore(ctx(101n, "9XAlpha")),
      (e: unknown) =>
        e instanceof ErgoAgentPayError &&
        e.code === "POLICY_REJECTED" &&
        /9XAlpha/.test(e.message)
    );
  });

  it("allows under the cap", async () => {
    const engine = new PolicyEngine({
      perRecipientCap: { "9XAlpha": 100n },
    });
    await assert.doesNotReject(() => engine.checkBefore(ctx(100n, "9XAlpha")));
  });

  it("falls back to maxSinglePayment for unlisted recipients", async () => {
    const engine = new PolicyEngine({
      maxSinglePayment: 50n,
      perRecipientCap: { "9XAlpha": 100n },
    });
    // Listed recipient gets 100n cap.
    await assert.doesNotReject(() => engine.checkBefore(ctx(75n, "9XAlpha")));
    // Unlisted recipient is bound by the global 50n cap.
    await assert.rejects(
      () => engine.checkBefore(ctx(75n, "9XOther")),
      (e: unknown) => e instanceof ErgoAgentPayError && /single-payment/.test(e.message)
    );
  });

  it("works with Map input", async () => {
    const engine = new PolicyEngine({
      perRecipientCap: new Map([["9XAlpha", 100n]]),
    });
    await assert.rejects(() => engine.checkBefore(ctx(101n, "9XAlpha")));
  });
});

// ── dailyBudget ──────────────────────────────────────────────────────────────

describe("dailyBudget", () => {
  it("rejects when projected daily total exceeds budget", async () => {
    const engine = new PolicyEngine({
      dailyBudget: 100n,
      now: () => 0,
    });
    await engine.checkBefore(ctx(50n));
    await engine.recordAfter(ctx(50n), RESULT);
    await assert.rejects(
      () => engine.checkBefore(ctx(51n)),
      (e: unknown) =>
        e instanceof ErgoAgentPayError &&
        e.code === "POLICY_REJECTED" &&
        /daily budget/.test(e.message)
    );
  });

  it("rolls over at UTC midnight", async () => {
    let nowMs = 0; // 1970-01-01 00:00:00 UTC
    const engine = new PolicyEngine({
      dailyBudget: 100n,
      now: () => nowMs,
    });
    await engine.checkBefore(ctx(100n));
    await engine.recordAfter(ctx(100n), RESULT);
    assert.equal(engine.totalDailySpend, 100n);

    // Move to next UTC day.
    nowMs = 86_400_000;
    assert.equal(engine.totalDailySpend, 0n);
    await assert.doesNotReject(() => engine.checkBefore(ctx(100n)));
  });

  it("totalDailySpend ticks the day even without payments", () => {
    let nowMs = 0;
    const engine = new PolicyEngine({
      dailyBudget: 100n,
      now: () => nowMs,
    });
    // First read locks epoch day 0.
    assert.equal(engine.totalDailySpend, 0n);
    // Move forward without any payment.
    nowMs = 86_400_000 * 5;
    assert.equal(engine.totalDailySpend, 0n);
  });

  it("dailyBudget is independent of session spend", async () => {
    const engine = new PolicyEngine({
      dailyBudget: 1_000n,
      now: () => 0,
    });
    await engine.checkBefore(ctx(500n));
    await engine.recordAfter(ctx(500n), RESULT);
    engine.resetSession();
    assert.equal(engine.totalSessionSpend, 0n);
    assert.equal(engine.totalDailySpend, 500n);
  });
});

// ── auditLog ─────────────────────────────────────────────────────────────────

describe("auditLog", () => {
  it("records a 'before allowed' event when accepting a payment", async () => {
    const events: AuditLogEvent[] = [];
    const engine = new PolicyEngine({ auditLog: (e) => void events.push(e) });
    await engine.checkBefore(ctx(1n));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.kind, "before");
    if (events[0]!.kind === "before") {
      assert.equal(events[0]!.allowed, true);
    }
  });

  it("records a 'before rejected' event with reason and code", async () => {
    const events: AuditLogEvent[] = [];
    const engine = new PolicyEngine({
      maxSinglePayment: 100n,
      auditLog: (e) => void events.push(e),
    });
    await assert.rejects(() => engine.checkBefore(ctx(101n)));
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.kind, "before");
    if (ev.kind === "before" && ev.allowed === false) {
      assert.equal(ev.code, "POLICY_REJECTED");
      assert.match(ev.reason, /single-payment/);
    } else {
      assert.fail("expected rejected event");
    }
  });

  it("records 'after' once a payment is recorded", async () => {
    const events: AuditLogEvent[] = [];
    const engine = new PolicyEngine({ auditLog: (e) => void events.push(e) });
    await engine.checkBefore(ctx(1n));
    await engine.recordAfter(ctx(1n), RESULT);
    assert.equal(events.length, 2);
    assert.equal(events[1]!.kind, "after");
  });

  it("swallows errors thrown by the sink so payment flow is unaffected", async () => {
    const engine = new PolicyEngine({
      auditLog: () => {
        throw new Error("disk full");
      },
    });
    await assert.doesNotReject(() => engine.checkBefore(ctx(1n)));
    await assert.doesNotReject(() => engine.recordAfter(ctx(1n), RESULT));
  });

  it("supports async sinks", async () => {
    const events: AuditLogEvent[] = [];
    const engine = new PolicyEngine({
      auditLog: async (e) => {
        await new Promise((r) => setTimeout(r, 1));
        events.push(e);
      },
    });
    await engine.checkBefore(ctx(1n));
    assert.equal(events.length, 1);
  });
});

// ── interaction order ─────────────────────────────────────────────────────────

describe("decision order", () => {
  it("blocklist wins over per-recipient cap and budget", async () => {
    const engine = new PolicyEngine({
      perRecipientCap: { "9XBad": 1_000_000n },
      dailyBudget: 1_000_000n,
      recipientBlocklist: ["9XBad"],
    });
    await assert.rejects(
      () => engine.checkBefore(ctx(1n, "9XBad")),
      (e: unknown) => e instanceof ErgoAgentPayError && /blocklist/.test(e.message)
    );
  });

  it("allowlist check happens before cap evaluation", async () => {
    const engine = new PolicyEngine({
      recipientAllowlist: ["9XGood"],
      maxSinglePayment: 50n,
    });
    await assert.rejects(
      () => engine.checkBefore(ctx(1_000_000n, "9XStranger")),
      (e: unknown) => e instanceof ErgoAgentPayError && /allowlist/.test(e.message)
    );
  });

  it("dailyBudget rejects after session limit if both are set", async () => {
    const engine = new PolicyEngine({
      maxSessionSpend: 500n,
      dailyBudget: 200n,
      now: () => 0,
    });
    // Session limit (500) is generous; daily (200) bites first.
    await assert.rejects(
      () => engine.checkBefore(ctx(201n)),
      (e: unknown) =>
        e instanceof ErgoAgentPayError && /daily budget/.test(e.message)
    );
  });
});
