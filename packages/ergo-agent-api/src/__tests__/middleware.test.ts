import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNotePaymentMiddleware } from "../adapters.js";
import { InMemoryReplayStore } from "../replay.js";
import type {
  NotePaymentAccepted,
  NotePaymentMiddlewareConfig,
  NotePaymentResponseBody,
} from "../types.js";
import type { NoteInfo } from "ergo-agent-pay";
import { ErgoAgentPayError } from "ergo-agent-pay";

function fakeAgent(notes: Record<string, NoteInfo | "missing">): unknown {
  return {
    config: { signer: undefined },
    async checkNote(boxId: string): Promise<NoteInfo> {
      const lookup = notes[boxId];
      if (!lookup || lookup === "missing") {
        throw new ErgoAgentPayError(`Note box ${boxId} not found.`, "BOX_NOT_FOUND");
      }
      return lookup;
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

interface MockReq {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  notePayment?: NotePaymentAccepted;
}

function mockRes() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";
  let ended = false;
  return {
    res: {
      get statusCode() { return statusCode; },
      set statusCode(v: number) { statusCode = v; },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      end(chunk?: string | Uint8Array) {
        if (chunk !== undefined) body += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        ended = true;
      },
    },
    inspect: () => ({ statusCode, headers, body, ended }),
  };
}

function makeConfig(notes: Record<string, NoteInfo | "missing">, partial: Partial<NotePaymentMiddlewareConfig> = {}): NotePaymentMiddlewareConfig {
  return {
    agent: fakeAgent(notes) as NotePaymentMiddlewareConfig["agent"],
    pricing: 1_000_000n,
    replayStore: new InMemoryReplayStore(),
    ...partial,
  };
}

describe("createNotePaymentMiddleware — accepted requests", () => {
  it("calls next() and attaches req.notePayment", async () => {
    const middleware = createNotePaymentMiddleware(makeConfig({ abc: makeNote() }));
    const req: MockReq = {
      url: "/api/analyze",
      method: "POST",
      headers: { "x-note-box-id": "abc" },
    };
    const { res, inspect } = mockRes();

    let nextCalls = 0;
    let nextErr: unknown;
    await middleware(req, res, (err) => {
      nextCalls += 1;
      nextErr = err;
    });

    assert.equal(nextCalls, 1);
    assert.equal(nextErr, undefined);
    assert.equal(inspect().ended, false, "middleware should leave the response open");
    assert.ok(req.notePayment, "expected req.notePayment to be set");
  });

  it("strips the query string before pricing lookup", async () => {
    let observedPath = "";
    const middleware = createNotePaymentMiddleware(
      makeConfig(
        { abc: makeNote() },
        {
          pricing: (req) => {
            observedPath = req.path;
            return 1_000_000n;
          },
        }
      )
    );
    await middleware(
      { url: "/api/analyze?x=1", method: "POST", headers: { "x-note-box-id": "abc" } },
      mockRes().res,
      () => {}
    );
    assert.equal(observedPath, "/api/analyze");
  });

  it("invokes onAccepted hook", async () => {
    let acceptedFired = false;
    const middleware = createNotePaymentMiddleware(
      makeConfig({ abc: makeNote() }, { onAccepted: () => { acceptedFired = true; } })
    );
    await middleware(
      { url: "/api/analyze", method: "POST", headers: { "x-note-box-id": "abc" } },
      mockRes().res,
      () => {}
    );
    // hook fires async via Promise.resolve — yield once
    await new Promise((r) => setImmediate(r));
    assert.equal(acceptedFired, true);
  });
});

describe("createNotePaymentMiddleware — rejected requests", () => {
  it("returns 402 with NotePaymentResponseBody when header is missing", async () => {
    const middleware = createNotePaymentMiddleware(makeConfig({ abc: makeNote() }));
    const { res, inspect } = mockRes();
    let nextCalls = 0;
    await middleware(
      { url: "/api/analyze", method: "POST", headers: {} },
      res,
      () => { nextCalls += 1; }
    );
    const r = inspect();
    assert.equal(nextCalls, 0, "middleware should not call next() on rejection");
    assert.equal(r.statusCode, 402);
    assert.match(r.headers["content-type"]!, /application\/json/);
    assert.equal(r.headers["note-required"], "1000000");
    assert.match(r.headers["www-authenticate"]!, /NotePayment/);
    const body = JSON.parse(r.body) as NotePaymentResponseBody;
    assert.equal(body.error, "PAYMENT_REQUIRED");
    assert.equal(body.required_nano_erg, "1000000");
    assert.equal(body.required_erg, "0.001");
    assert.equal(body.note_header, "x-note-box-id");
  });

  it("returns 402 with NOTE_NOT_FOUND for missing boxes", async () => {
    const middleware = createNotePaymentMiddleware(makeConfig({ abc: "missing" }));
    const { res, inspect } = mockRes();
    await middleware(
      { url: "/api/analyze", method: "POST", headers: { "x-note-box-id": "abc" } },
      res,
      () => {}
    );
    const r = inspect();
    assert.equal(r.statusCode, 402);
    const body = JSON.parse(r.body) as NotePaymentResponseBody;
    assert.equal(body.error, "NOTE_NOT_FOUND");
  });

  it("returns 409 for replay attempts", async () => {
    const middleware = createNotePaymentMiddleware(makeConfig({ abc: makeNote() }));
    // first request
    await middleware(
      { url: "/api/analyze", method: "POST", headers: { "x-note-box-id": "abc" } },
      mockRes().res,
      () => {}
    );
    // second request with same boxId
    const { res, inspect } = mockRes();
    await middleware(
      { url: "/api/analyze", method: "POST", headers: { "x-note-box-id": "abc" } },
      res,
      () => {}
    );
    assert.equal(inspect().statusCode, 409);
    const body = JSON.parse(inspect().body) as NotePaymentResponseBody;
    assert.equal(body.error, "REPLAY");
  });

  it("invokes onRejected hook with the rejection details", async () => {
    let captured: unknown;
    const middleware = createNotePaymentMiddleware(
      makeConfig({ abc: makeNote() }, { onRejected: (e) => { captured = e; } })
    );
    const { res } = mockRes();
    await middleware({ url: "/api/analyze", method: "POST", headers: {} }, res, () => {});
    await new Promise((r) => setImmediate(r));
    assert.ok(captured, "onRejected should fire");
    const ev = captured as { reason: string };
    assert.equal(ev.reason, "PAYMENT_REQUIRED");
  });
});
