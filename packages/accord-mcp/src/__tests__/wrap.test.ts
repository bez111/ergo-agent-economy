import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accordHashV0, type AccordAgreement, type AccordVerificationReceipt } from "@accord-protocol/core";
import {
  ACCORD_MCP_ERROR_CODES,
  describeAccordMcpTool,
  injectAccordSchemaFields,
  wrapAccordMcp,
  type AccordRailAdapter,
} from "../index.js";

// ── helpers ─────────────────────────────────────────────────────────────────

function minimalAgreement(overrides: Partial<AccordAgreement> = {}): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0000000000000000000000",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://buyer" },
    seller: { id: "provider://seller" },
    task: { kind: "summarise", input_ref: "inline:hello", description: "x" },
    price: { amount: "1", currency: "ERG", decimals: 9 },
    payment: {
      mode: "note",
      rail: "ergo",
      reserve_ref: "ergo:box:abc",
      deadline: "+480 blocks",
    },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
    ...overrides,
  };
}

function makeRail(stub: Partial<AccordRailAdapter> = {}): AccordRailAdapter {
  return {
    rail: "test",
    verifyPayment: async () => ({ ok: true, rail: "test" }),
    ...stub,
  } as AccordRailAdapter;
}

// ── injectAccordSchemaFields ────────────────────────────────────────────────

describe("injectAccordSchemaFields", () => {
  it("adds the three accord_* fields to required[]", () => {
    const out = injectAccordSchemaFields({ type: "object", properties: { text: {} } });
    assert.deepEqual(
      out.required?.sort(),
      ["accord_agreement_id", "accord_payment"].sort(),
    );
    assert.ok(out.properties);
    assert.ok("accord_agreement_id" in out.properties!);
    assert.ok("accord_payment" in out.properties!);
    assert.ok("accord_task_output" in out.properties!);
    assert.ok("text" in out.properties!);
  });

  it("merges with the seller's existing required[]", () => {
    const out = injectAccordSchemaFields({
      type: "object",
      properties: { text: {} },
      required: ["text"],
    });
    assert.deepEqual(
      out.required?.sort(),
      ["accord_agreement_id", "accord_payment", "text"].sort(),
    );
  });

  it("works when the input schema is undefined", () => {
    const out = injectAccordSchemaFields(undefined);
    assert.equal(out.type, "object");
    assert.deepEqual(
      out.required?.sort(),
      ["accord_agreement_id", "accord_payment"].sort(),
    );
  });
});

// ── describeAccordMcpTool ───────────────────────────────────────────────────

describe("describeAccordMcpTool", () => {
  it("preserves name + description, injects schema", () => {
    const desc = describeAccordMcpTool({
      name: "summarise",
      description: "summarise text",
      inputSchema: { type: "object", properties: { text: {} } },
    });
    assert.equal(desc.name, "summarise");
    assert.equal(desc.description, "summarise text");
    assert.ok("accord_agreement_id" in (desc.inputSchema?.properties ?? {}));
  });
});

// ── wrapAccordMcp — failure paths ───────────────────────────────────────────

describe("wrapAccordMcp — error paths", () => {
  it("returns MISSING_AGREEMENT_ID when the field is absent", async () => {
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => minimalAgreement(),
    });
    const r = await call({} as never);
    assert.equal(r.isError, true);
    if (r.isError) {
      assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.MISSING_AGREEMENT_ID);
    }
  });

  it("returns MISSING_PAYMENT when accord_payment is absent", async () => {
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => minimalAgreement(),
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.MISSING_PAYMENT);
  });

  it("returns UNKNOWN_AGREEMENT when resolveAgreement returns undefined", async () => {
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => undefined,
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.UNKNOWN_AGREEMENT);
  });

  it("returns AGREEMENT_INVALID when the resolved agreement fails validation", async () => {
    const broken = minimalAgreement({ created_at: "not-a-date" } as never);
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => broken,
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.AGREEMENT_INVALID);
  });

  it("returns PAYMENT_VERIFICATION_FAILED when the rail rejects", async () => {
    const call = wrapAccordMcp({
      rail: makeRail({
        verifyPayment: async () => ({
          ok: false,
          rail: "test",
          code: "INSUFFICIENT_VALUE",
          message: "note value too low",
        }),
      }),
      handler: async () => "ok",
      resolveAgreement: async () => minimalAgreement(),
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) {
      assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.PAYMENT_VERIFICATION_FAILED);
      assert.equal(r._meta.rail_error_code, "INSUFFICIENT_VALUE");
    }
  });

  it("returns RAIL_UNAVAILABLE when the rail throws", async () => {
    const call = wrapAccordMcp({
      rail: makeRail({
        verifyPayment: async () => {
          throw new Error("boom");
        },
      }),
      handler: async () => "ok",
      resolveAgreement: async () => minimalAgreement(),
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.RAIL_UNAVAILABLE);
  });

  it("returns TASK_OUTPUT_HASH_MISMATCH when the buyer's accord_task_output hash differs from agreement.task.output_hash", async () => {
    const expected = "different output";
    const expectedHash = "blake2b256:0x" + accordHashV0(expected);
    const ag = minimalAgreement({
      task: {
        kind: "summarise",
        input_ref: "inline:hello",
        description: "x",
        output_hash: expectedHash,
      },
    });
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
      accord_task_output: "wrong output",
    } as never);
    assert.equal(r.isError, true);
    if (r.isError)
      assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.TASK_OUTPUT_HASH_MISMATCH);
  });

  it("returns HANDLER_THREW when the seller's handler throws", async () => {
    const call = wrapAccordMcp<{ text?: string }, string>({
      rail: makeRail(),
      handler: async () => {
        throw new Error("internal failure");
      },
      resolveAgreement: async () => minimalAgreement(),
    });
    const r = await call({
      accord_agreement_id: "acc_01HX0000000000000000000000",
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError) assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.HANDLER_THREW);
  });

  it("returns VERIFICATION_REQUIRED when verification.required=true but no verifier is configured", async () => {
    const ag = minimalAgreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://x" },
    });
    const call = wrapAccordMcp({
      rail: makeRail(),
      handler: async () => "ok",
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError)
      assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.VERIFICATION_REQUIRED);
  });

  it("returns VERIFICATION_REJECTED when the verifier returns result=rejected", async () => {
    const ag = minimalAgreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://x" },
    });
    const verifier = async (): Promise<AccordVerificationReceipt> => ({
      type: "accord.verification_receipt.v0",
      version: "v0",
      receipt_id: "vr_01HX0000000000000000000000",
      agreement_id: ag.agreement_id,
      agreement_hash: "blake2b256:0x" + accordHashV0(ag),
      verifier: { id: "verifier://x" },
      result: "rejected",
      evidence: { output_hash: "blake2b256:0x" + "1".repeat(64) },
      checks: [{ name: "schema_valid", result: "fail" }],
      created_at: "2026-05-07T00:00:10Z",
      signature: { scheme: "ed25519", public_key: "0xaa", signature: "0xbb" },
    });
    const call = wrapAccordMcp({
      rail: makeRail(),
      verifier,
      handler: async () => "ok",
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, true);
    if (r.isError)
      assert.equal(r._meta.accord_error_code, ACCORD_MCP_ERROR_CODES.VERIFICATION_REJECTED);
  });
});

// ── wrapAccordMcp — happy paths ─────────────────────────────────────────────

describe("wrapAccordMcp — happy paths", () => {
  it("runs the handler and returns its output when verification is not required", async () => {
    const ag = minimalAgreement();
    const call = wrapAccordMcp<{ text: string }, { word_count: number }>({
      rail: makeRail(),
      handler: async (args) => ({ word_count: args.text.split(/\s+/).length }),
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
      text: "hello world",
    } as never);
    assert.equal(r.isError, undefined);
    if (!r.isError) {
      assert.equal(r.output.word_count, 2);
      assert.equal(r._meta.accord_agreement_id, ag.agreement_id);
      assert.match(r._meta.accord_agreement_hash, /^blake2b256:0x[0-9a-f]{64}$/);
      assert.equal(r._meta.accord_verification_receipt, undefined);
    }
  });

  it("strips Accord fields from args before calling the handler", async () => {
    const ag = minimalAgreement();
    let observed: unknown = null;
    const call = wrapAccordMcp<{ text: string }, string>({
      rail: makeRail(),
      handler: async (args) => {
        observed = args;
        return "ok";
      },
      resolveAgreement: async () => ag,
    });
    await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
      accord_task_output: "anything",
      text: "hi",
    } as never);
    assert.deepEqual(observed, { text: "hi" });
  });

  it("attaches the verification + settlement receipts when both are produced", async () => {
    const ag = minimalAgreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://ok" },
    });
    const verifier = async (): Promise<AccordVerificationReceipt> => ({
      type: "accord.verification_receipt.v0",
      version: "v0",
      receipt_id: "vr_01HX0000000000000000000000",
      agreement_id: ag.agreement_id,
      agreement_hash: "blake2b256:0x" + accordHashV0(ag),
      verifier: { id: "verifier://ok" },
      result: "accepted",
      evidence: { output_hash: "blake2b256:0x" + "1".repeat(64) },
      created_at: "2026-05-07T00:00:10Z",
      signature: { scheme: "ed25519", public_key: "0xaa", signature: "0xbb" },
    });
    const settle = async () => ({
      type: "accord.settlement_receipt.v0" as const,
      version: "v0" as const,
      settlement_id: "sr_01HX0000000000000000000000",
      agreement_id: ag.agreement_id,
      agreement_hash: "blake2b256:0x" + accordHashV0(ag),
      rail: "ergo" as const,
      mode: "note_redeemed" as const,
      status: "settled" as const,
      amount: "1",
      currency: "ERG" as const,
      decimals: 9,
      tx: {
        network: "testnet" as const,
        tx_id: "0x" + "a".repeat(64),
        box_id: "0x" + "b".repeat(64),
      },
      created_at: "2026-05-07T00:00:20Z",
    });
    const call = wrapAccordMcp({
      rail: { rail: "ergo", verifyPayment: async () => ({ ok: true, rail: "ergo" }), settle },
      verifier,
      handler: async () => "ok",
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, undefined);
    if (!r.isError) {
      assert.equal(r._meta.accord_verification_receipt?.result, "accepted");
      assert.equal(r._meta.accord_settlement_receipt?.status, "settled");
    }
  });

  it("does NOT reject the call when settle() throws after handler success", async () => {
    const ag = minimalAgreement();
    const call = wrapAccordMcp({
      rail: {
        rail: "test",
        verifyPayment: async () => ({ ok: true, rail: "test" }),
        settle: async () => {
          throw new Error("rail down");
        },
      },
      handler: async () => "ok",
      resolveAgreement: async () => ag,
    });
    const r = await call({
      accord_agreement_id: ag.agreement_id,
      accord_payment: { proof: "x" },
    } as never);
    assert.equal(r.isError, undefined);
    if (!r.isError) {
      assert.equal(r._meta.accord_settlement_receipt, undefined);
    }
  });
});
