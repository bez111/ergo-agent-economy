import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processPaymentRequest, resolveConfig } from "../handler.js";
import { InMemoryReplayStore } from "../replay.js";
import type { NotePaymentMiddlewareConfig, NotePaymentRequest } from "../types.js";
import type { NoteInfo } from "ergo-agent-pay";
import { ErgoAgentPayError } from "ergo-agent-pay";

// ── Fake agent ────────────────────────────────────────────────────────────────
//
// We don't want to hit the testnet API in unit tests. The SDK's ErgoAgentPay
// has a small surface that processPaymentRequest actually calls — checkNote
// and redeemNote — so we construct a minimal stand-in that satisfies the
// duck-typed shape and feed it as `agent`.

interface FakeAgentOpts {
  notes: Record<string, NoteInfo | "missing">;
  signer?: boolean;
  redeemResult?: { txId?: string; submitted: boolean };
  redeemThrows?: Error;
}

function fakeAgent(opts: FakeAgentOpts): unknown {
  return {
    config: { signer: opts.signer ? () => undefined : undefined },
    async checkNote(boxId: string): Promise<NoteInfo> {
      const lookup = opts.notes[boxId];
      if (!lookup || lookup === "missing") {
        throw new ErgoAgentPayError(`Note box ${boxId} not found.`, "BOX_NOT_FOUND");
      }
      return lookup;
    },
    async redeemNote(args: { noteBoxId: string }) {
      if (opts.redeemThrows) throw opts.redeemThrows;
      return {
        unsignedTx: {},
        submitted: opts.redeemResult?.submitted ?? false,
        txId: opts.redeemResult?.txId,
        redeemed: { noteBoxId: args.noteBoxId, value: "0", receiver: "" },
      };
    },
  };
}

function makeNote(overrides: Partial<NoteInfo> = {}): NoteInfo {
  return {
    boxId: "abc",
    value: 5_000_000n,
    ergs: "0.005",
    expiryBlock: 2_000_000,
    currentBlock: 1_000_000,
    isExpired: false,
    raw: {},
    ...overrides,
  };
}

function makeReq(overrides: Partial<NotePaymentRequest> = {}): NotePaymentRequest {
  return {
    headers: { "x-note-box-id": "abc" },
    path: "/api/analyze",
    method: "POST",
    ...overrides,
  };
}

function makeConfig(opts: FakeAgentOpts, partial: Partial<NotePaymentMiddlewareConfig> = {}): NotePaymentMiddlewareConfig {
  return {
    agent: fakeAgent(opts) as unknown as NotePaymentMiddlewareConfig["agent"],
    pricing: 1_000_000n,
    replayStore: new InMemoryReplayStore(),
    ...partial,
  };
}

// ── Acceptance / rejection ────────────────────────────────────────────────────

describe("processPaymentRequest — acceptance path", () => {
  it("accepts a valid Note above the price", async () => {
    const config = makeConfig({ notes: { abc: makeNote() } });
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "accepted");
    if (verdict.kind === "accepted") {
      assert.equal(verdict.noteBoxId, "abc");
      assert.equal(verdict.price, 1_000_000n);
      assert.equal(verdict.redemption, undefined); // no signer → verify-only
    }
  });

  it("redeems the Note when redeemStrategy='immediate'", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote() }, signer: true, redeemResult: { txId: "tx0", submitted: true } },
      { redeemStrategy: "immediate" }
    );
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "accepted");
    if (verdict.kind === "accepted") {
      assert.equal(verdict.redemption?.txId, "tx0");
      assert.equal(verdict.redemption?.submitted, true);
    }
  });

  it("auto-picks 'immediate' when the agent has a signer", async () => {
    const resolved = resolveConfig(makeConfig({ notes: { abc: makeNote() }, signer: true }));
    assert.equal(resolved.redeemStrategy, "immediate");
  });

  it("auto-picks 'verify-only' when the agent has no signer", async () => {
    const resolved = resolveConfig(makeConfig({ notes: { abc: makeNote() } }));
    assert.equal(resolved.redeemStrategy, "verify-only");
  });
});

describe("processPaymentRequest — rejection path", () => {
  it("PAYMENT_REQUIRED when header is missing", async () => {
    const config = makeConfig({ notes: { abc: makeNote() } });
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq({ headers: {} }));
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") {
      assert.equal(verdict.code, "PAYMENT_REQUIRED");
      assert.equal(verdict.price, 1_000_000n);
    }
  });

  it("PAYMENT_REQUIRED when header is empty/whitespace", async () => {
    const config = makeConfig({ notes: { abc: makeNote() } });
    const verdict = await processPaymentRequest(
      resolveConfig(config),
      makeReq({ headers: { "x-note-box-id": "   " } })
    );
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") assert.equal(verdict.code, "PAYMENT_REQUIRED");
  });

  it("NOTE_NOT_FOUND when the box is not on chain", async () => {
    const config = makeConfig({ notes: { abc: "missing" } });
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") assert.equal(verdict.code, "NOTE_NOT_FOUND");
  });

  it("NOTE_EXPIRED when current height >= expiry", async () => {
    const config = makeConfig({ notes: { abc: makeNote({ isExpired: true, expiryBlock: 100, currentBlock: 200 }) } });
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") assert.equal(verdict.code, "NOTE_EXPIRED");
  });

  it("VALUE_TOO_LOW when Note value < price", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote({ value: 500n }) } },
      { pricing: 1_000_000n }
    );
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") assert.equal(verdict.code, "VALUE_TOO_LOW");
  });

  it("REDEMPTION_FAILED when the signer/SDK throws", async () => {
    const config = makeConfig(
      {
        notes: { abc: makeNote() },
        signer: true,
        redeemThrows: new Error("signer offline"),
      },
      { redeemStrategy: "immediate" }
    );
    const verdict = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(verdict.kind, "rejected");
    if (verdict.kind === "rejected") {
      assert.equal(verdict.code, "REDEMPTION_FAILED");
      assert.match(verdict.message, /signer offline/);
    }
  });
});

// ── Replay protection ─────────────────────────────────────────────────────────

describe("replay protection", () => {
  it("REPLAY when the same boxId is seen twice", async () => {
    const config = makeConfig({ notes: { abc: makeNote() } });
    const resolved = resolveConfig(config);
    const first = await processPaymentRequest(resolved, makeReq());
    assert.equal(first.kind, "accepted");
    const second = await processPaymentRequest(resolved, makeReq());
    assert.equal(second.kind, "rejected");
    if (second.kind === "rejected") assert.equal(second.code, "REPLAY");
  });

  it("releases the claim if the Note is not on chain", async () => {
    const config = makeConfig({ notes: { abc: "missing" } });
    const store = new InMemoryReplayStore();
    config.replayStore = store;
    const resolved = resolveConfig(config);
    const v = await processPaymentRequest(resolved, makeReq());
    assert.equal(v.kind, "rejected");
    assert.equal(store.has("abc"), false, "expected boxId to be released");
  });

  it("releases the claim if redemption fails", async () => {
    const store = new InMemoryReplayStore();
    const config = makeConfig(
      {
        notes: { abc: makeNote() },
        signer: true,
        redeemThrows: new Error("signer offline"),
      },
      { redeemStrategy: "immediate", replayStore: store }
    );
    const resolved = resolveConfig(config);
    await processPaymentRequest(resolved, makeReq());
    assert.equal(store.has("abc"), false);
  });
});

// ── Pricing ──────────────────────────────────────────────────────────────────

describe("pricing variants", () => {
  it("flat bigint pricing", async () => {
    const config = makeConfig({ notes: { abc: makeNote({ value: 5n }) } }, { pricing: 5n });
    const v = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(v.kind, "accepted");
    if (v.kind === "accepted") assert.equal(v.price, 5n);
  });

  it("path-keyed pricing with 'default' fallback", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote({ value: 9_000_000n }) } },
      { pricing: { "/api/analyze": 5_000_000n, default: 1_000n } }
    );
    const exact = await processPaymentRequest(
      resolveConfig(config),
      makeReq({ path: "/api/analyze", headers: { "x-note-box-id": "abc" } })
    );
    assert.equal(exact.kind, "accepted");
    if (exact.kind === "accepted") assert.equal(exact.price, 5_000_000n);

    // For a different path we'd hit the fallback — but we'd reuse the boxId
    // and get REPLAY first, so use a different boxId.
    const config2 = makeConfig(
      { notes: { def: makeNote({ value: 9_000_000n, boxId: "def" }) } },
      { pricing: { "/api/analyze": 5_000_000n, default: 1_000n } }
    );
    const fallback = await processPaymentRequest(
      resolveConfig(config2),
      makeReq({ path: "/api/other", headers: { "x-note-box-id": "def" } })
    );
    assert.equal(fallback.kind, "accepted");
    if (fallback.kind === "accepted") assert.equal(fallback.price, 1_000n);
  });

  it("rejects with INTERNAL_ERROR when pricing has no match and no default", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote() } },
      { pricing: { "/api/different": 1_000n } }
    );
    const v = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(v.kind, "rejected");
    if (v.kind === "rejected") assert.equal(v.code, "INTERNAL_ERROR");
  });

  it("function-based pricing", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote({ value: 7n }) } },
      { pricing: (req) => (req.method === "POST" ? 5n : 9n) }
    );
    const v = await processPaymentRequest(resolveConfig(config), makeReq());
    assert.equal(v.kind, "accepted");
    if (v.kind === "accepted") assert.equal(v.price, 5n);
  });
});

// ── Header normalisation ─────────────────────────────────────────────────────

describe("header lookup", () => {
  it("is case-insensitive", async () => {
    const config = makeConfig({ notes: { abc: makeNote() } });
    const v = await processPaymentRequest(
      resolveConfig(config),
      makeReq({ headers: { "X-Note-Box-Id": "abc" } })
    );
    assert.equal(v.kind, "accepted");
  });

  it("supports custom noteHeader", async () => {
    const config = makeConfig(
      { notes: { abc: makeNote() } },
      { noteHeader: "x-pay-note" }
    );
    const v = await processPaymentRequest(
      resolveConfig(config),
      makeReq({ headers: { "x-pay-note": "abc" } })
    );
    assert.equal(v.kind, "accepted");
  });
});
