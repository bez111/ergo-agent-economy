import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPaywalledTool, type PaywalledTool } from "../paywall.js";
import type { NoteInfo } from "ergo-agent-pay";
import { ErgoAgentPayError } from "ergo-agent-pay";
import { InMemoryReplayStore } from "ergo-agent-api";

// ── fake agent with the duck-typed shape ergo-agent-api expects ─────────────

interface FakeAgentOpts {
  notes: Record<string, NoteInfo | "missing">;
  signer?: boolean;
  redeemResult?: { txId?: string; submitted: boolean };
  redeemThrows?: Error;
  checkThrows?: Error;
}

function fakeAgent(opts: FakeAgentOpts): unknown {
  return {
    config: { signer: opts.signer ? () => undefined : undefined },
    async checkNote(boxId: string): Promise<NoteInfo> {
      if (opts.checkThrows) throw opts.checkThrows;
      const lookup = opts.notes[boxId];
      if (!lookup || lookup === "missing") {
        throw new ErgoAgentPayError(`Note ${boxId} not found.`, "BOX_NOT_FOUND");
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

function buildTool(opts: {
  notes: Record<string, NoteInfo | "missing">;
  signer?: boolean;
  redeemResult?: { txId?: string; submitted: boolean };
  redeemThrows?: Error;
  pricing?: bigint | Record<string, bigint>;
  redeemStrategy?: "immediate" | "verify-only";
  onAccepted?: (e: unknown) => void;
  onRejected?: (e: unknown) => void;
  noteField?: string;
  taskOutputField?: string;
}): PaywalledTool {
  return createPaywalledTool({
    name: "summarise",
    description: "Pay to summarise a string.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    pricing: opts.pricing ?? 1_000_000n,
    agent: fakeAgent(opts) as never,
    redeemStrategy: opts.redeemStrategy,
    onAccepted: opts.onAccepted as never,
    onRejected: opts.onRejected as never,
    noteField: opts.noteField,
    taskOutputField: opts.taskOutputField,
    handler: (args, ctx) => ({
      content: [
        {
          type: "text",
          text: `summary: ${String(args["text"]).slice(0, 4)} | boxId=${ctx.payment.noteBoxId}`,
        },
      ],
    }),
  });
}

// ── input-schema injection ───────────────────────────────────────────────────

describe("createPaywalledTool — schema injection", () => {
  it("adds note_box_id to properties and required", () => {
    const tool = buildTool({ notes: {} });
    const schema = tool.inputSchema as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    assert.ok(schema.properties["note_box_id"]);
    assert.equal(schema.properties["note_box_id"].type, "string");
    assert.ok(schema.required.includes("note_box_id"));
    // Original required field preserved.
    assert.ok(schema.required.includes("text"));
  });

  it("adds task_output to properties (optional, not in required)", () => {
    const tool = buildTool({ notes: {} });
    const schema = tool.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.ok(schema.properties["task_output"]);
    assert.equal(schema.required.includes("task_output"), false);
  });

  it("respects custom field names", () => {
    const tool = buildTool({ notes: {}, noteField: "note", taskOutputField: "output" });
    const schema = tool.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.ok(schema.properties["note"]);
    assert.ok(schema.properties["output"]);
    assert.ok(schema.required.includes("note"));
  });

  it("does not override caller-supplied note_box_id schema", () => {
    const tool = createPaywalledTool({
      name: "x",
      description: "x",
      inputSchema: {
        type: "object",
        properties: {
          note_box_id: { type: "string", description: "custom desc" },
        },
        required: ["note_box_id"],
      },
      pricing: 1_000_000n,
      agent: fakeAgent({ notes: {} }) as never,
      handler: () => ({ content: [{ type: "text", text: "" }] }),
    });
    const schema = tool.inputSchema as {
      properties: Record<string, { description?: string }>;
    };
    assert.equal(schema.properties["note_box_id"].description, "custom desc");
  });
});

// ── happy path ───────────────────────────────────────────────────────────────

describe("createPaywalledTool — accepted call", () => {
  it("runs the wrapped handler with payment context", async () => {
    const tool = buildTool({ notes: { abc: makeNote() } });
    const result = await tool.call({ text: "hello world", note_box_id: "abc" });
    assert.equal(result.isError, undefined);
    assert.match((result.content[0] as { text: string }).text, /summary: hell.*boxId=abc/);
  });

  it("strips note_box_id and task_output from args before passing to handler", async () => {
    let capturedArgs: Record<string, unknown> | null = null;
    const tool = createPaywalledTool({
      name: "echo",
      description: "echo",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
      pricing: 1_000_000n,
      agent: fakeAgent({ notes: { abc: makeNote() } }) as never,
      handler: (args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    await tool.call({ text: "x", note_box_id: "abc", task_output: "secret-payload" });
    assert.deepEqual(capturedArgs, { text: "x" });
  });

  it("passes verified note info to the handler context", async () => {
    interface Captured {
      payment: { noteBoxId: string; note: NoteInfo };
    }
    let receivedContext: Captured | null = null;
    const tool = createPaywalledTool({
      name: "x",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      pricing: 1_000n,
      agent: fakeAgent({ notes: { abc: makeNote({ value: 9_000n }) } }) as never,
      handler: (_args, ctx) => {
        receivedContext = ctx as Captured;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    await tool.call({ note_box_id: "abc" });
    assert.ok(receivedContext);
    const r = receivedContext as Captured;
    assert.equal(r.payment.noteBoxId, "abc");
    assert.equal(r.payment.note.value, 9_000n);
  });

  it("redeems inline when signer is configured + redeemStrategy='immediate'", async () => {
    interface Captured {
      payment: { redemption?: { txId?: string; submitted: boolean } };
    }
    let captured: Captured | null = null;
    const tool = createPaywalledTool({
      name: "x",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      pricing: 1_000_000n,
      agent: fakeAgent({
        notes: { abc: makeNote() },
        signer: true,
        redeemResult: { txId: "tx-paid", submitted: true },
      }) as never,
      redeemStrategy: "immediate",
      handler: (_a, ctx) => {
        captured = ctx as Captured;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    await tool.call({ note_box_id: "abc" });
    assert.ok(captured);
    const c = captured as Captured;
    assert.equal(c.payment.redemption?.txId, "tx-paid");
    assert.equal(c.payment.redemption?.submitted, true);
  });
});

// ── rejection paths ──────────────────────────────────────────────────────────

describe("createPaywalledTool — rejected calls", () => {
  it("returns a structured error when note_box_id is missing", async () => {
    const tool = buildTool({ notes: { abc: makeNote() } });
    const r = await tool.call({ text: "x" });
    assert.equal(r.isError, true);
    assert.equal(r._meta!["error_code"], "PAYMENT_REQUIRED");
    assert.match((r.content[0] as { text: string }).text, /PAYMENT_REQUIRED/);
  });

  it("rejects with NOTE_NOT_FOUND for unknown boxes", async () => {
    const tool = buildTool({ notes: { abc: "missing" } });
    const r = await tool.call({ note_box_id: "abc" });
    assert.equal(r._meta!["error_code"], "NOTE_NOT_FOUND");
  });

  it("rejects with NOTE_EXPIRED for expired notes", async () => {
    const tool = buildTool({
      notes: {
        abc: makeNote({ isExpired: true, expiryBlock: 100, currentBlock: 200 }),
      },
    });
    const r = await tool.call({ note_box_id: "abc" });
    assert.equal(r._meta!["error_code"], "NOTE_EXPIRED");
  });

  it("rejects with VALUE_TOO_LOW when Note value < price", async () => {
    const tool = buildTool({
      notes: { abc: makeNote({ value: 500n }) },
      pricing: 1_000_000n,
    });
    const r = await tool.call({ note_box_id: "abc" });
    assert.equal(r._meta!["error_code"], "VALUE_TOO_LOW");
    assert.equal(r._meta!["required_nano_erg"], "1000000");
  });

  it("rejects with REDEMPTION_FAILED when signer throws", async () => {
    const tool = buildTool({
      notes: { abc: makeNote() },
      signer: true,
      redeemThrows: new Error("signer offline"),
      redeemStrategy: "immediate",
    });
    const r = await tool.call({ note_box_id: "abc" });
    assert.equal(r._meta!["error_code"], "REDEMPTION_FAILED");
    assert.match((r.content[0] as { text: string }).text, /signer offline/);
  });

  it("rejects with INTERNAL_ERROR if the user handler throws", async () => {
    const tool = createPaywalledTool({
      name: "x",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      pricing: 1_000n,
      agent: fakeAgent({ notes: { abc: makeNote() } }) as never,
      handler: () => {
        throw new Error("oh no");
      },
    });
    const r = await tool.call({ note_box_id: "abc" });
    assert.equal(r._meta!["error_code"], "INTERNAL_ERROR");
    assert.match((r.content[0] as { text: string }).text, /oh no/);
  });
});

// ── replay protection ───────────────────────────────────────────────────────

describe("createPaywalledTool — replay protection", () => {
  it("returns REPLAY when the same boxId is reused", async () => {
    const tool = buildTool({ notes: { abc: makeNote() } });
    const first = await tool.call({ text: "x", note_box_id: "abc" });
    assert.equal(first.isError, undefined);
    const second = await tool.call({ text: "x", note_box_id: "abc" });
    assert.equal(second._meta!["error_code"], "REPLAY");
  });

  it("releases the replay claim if redemption fails", async () => {
    const store = new InMemoryReplayStore();
    const tool = createPaywalledTool({
      name: "x",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      pricing: 1_000_000n,
      agent: fakeAgent({
        notes: { abc: makeNote() },
        signer: true,
        redeemThrows: new Error("signer offline"),
      }) as never,
      redeemStrategy: "immediate",
      replayStore: store,
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    await tool.call({ note_box_id: "abc" });
    assert.equal(store.has("abc"), false, "expected boxId to be released");
  });
});

// ── pricing variants ────────────────────────────────────────────────────────

describe("createPaywalledTool — pricing variants", () => {
  it("supports flat bigint pricing", async () => {
    const tool = buildTool({
      notes: { abc: makeNote({ value: 5n }) },
      pricing: 5n,
    });
    const r = await tool.call({ text: "x", note_box_id: "abc" });
    assert.equal(r.isError, undefined);
  });

  it("supports path-keyed pricing using the tool name as path", async () => {
    const tool = createPaywalledTool({
      name: "expensive_tool",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      pricing: { "/expensive_tool": 10_000_000n, default: 1n },
      agent: fakeAgent({ notes: { abc: makeNote({ value: 9_000_000n }) } }) as never,
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    const r = await tool.call({ note_box_id: "abc" });
    // value 9_000_000 < expensive_tool price 10_000_000 → VALUE_TOO_LOW
    assert.equal(r._meta!["error_code"], "VALUE_TOO_LOW");
    assert.equal(r._meta!["required_nano_erg"], "10000000");
  });
});

// ── audit hooks ──────────────────────────────────────────────────────────────

describe("createPaywalledTool — audit hooks", () => {
  it("invokes onAccepted on a successful payment", async () => {
    let captured: unknown = null;
    const tool = buildTool({
      notes: { abc: makeNote() },
      onAccepted: (e) => {
        captured = e;
      },
    });
    await tool.call({ text: "x", note_box_id: "abc" });
    await new Promise((r) => setImmediate(r));
    assert.ok(captured);
  });

  it("invokes onRejected with the rejection event", async () => {
    let captured: { reason?: string } = {};
    const tool = buildTool({
      notes: { abc: "missing" },
      onRejected: (e) => {
        captured = e as never;
      },
    });
    await tool.call({ note_box_id: "abc" });
    await new Promise((r) => setImmediate(r));
    assert.equal(captured.reason, "NOTE_NOT_FOUND");
  });

  it("does not break the tool flow if a hook throws", async () => {
    const tool = buildTool({
      notes: { abc: makeNote() },
      onAccepted: () => {
        throw new Error("hook failure");
      },
    });
    const r = await tool.call({ text: "x", note_box_id: "abc" });
    assert.equal(r.isError, undefined);
  });
});
