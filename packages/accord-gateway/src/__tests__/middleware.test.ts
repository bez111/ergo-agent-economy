import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accordHashV0, type AccordAgreement, type AccordVerificationReceipt } from "@accord-protocol/core";
import {
  accordGateway,
  ACCORD_GATEWAY_ERROR_CODES,
  ACCORD_HEADERS,
  InMemoryReplayStore,
  type AccordHttpRequest,
  type AccordHttpResponse,
  type AccordRailAdapter,
  type AgreementTemplate,
} from "../index.js";

// ── tiny mock res ───────────────────────────────────────────────────────────

interface MockRes extends AccordHttpResponse {
  body: string | undefined;
  headerMap: Map<string, string>;
  ended: boolean;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    headerMap: new Map(),
    body: undefined,
    ended: false,
    setHeader(name: string, value: string) {
      res.headerMap.set(name.toLowerCase(), value);
    },
    end(payload?: string) {
      res.body = payload;
      res.ended = true;
    },
  };
  return res;
}

function bodyJson(res: MockRes): Record<string, unknown> {
  return JSON.parse(res.body ?? "{}");
}

// ── fixtures ────────────────────────────────────────────────────────────────

function minimalAgreement(overrides: Partial<AccordAgreement> = {}): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0000000000000000000000",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://buyer" },
    seller: { id: "provider://seller" },
    task: { kind: "summarise", input_ref: "inline:hi", description: "x" },
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
    verifyPayment: async () => ({ ok: true, rail: "test", payment_id: "tx-001" }),
    ...stub,
  } as AccordRailAdapter;
}

const TEMPLATE: AgreementTemplate = {
  agreement_template: "https://provider.test/.well-known/accord/agreement-template",
  price: { amount: "1", currency: "ERG", decimals: 9 },
  accepted_rails: ["ergo", "rosen"],
  verification_required: false,
};

function reqWith(headers: Record<string, string>, body?: unknown): AccordHttpRequest {
  return { method: "POST", url: "/api/run", headers, body };
}

// ── 402 challenge paths ─────────────────────────────────────────────────────

describe("accordGateway — 402 challenge", () => {
  it("returns 402 with the agreement template when no Accord headers are present", async () => {
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => "should not run",
    });
    const res = mockRes();
    await mw(reqWith({}), res, () => {});
    assert.equal(res.statusCode, 402);
    assert.equal(res.headerMap.get(ACCORD_HEADERS.agreementRequired), "true");
    assert.equal(res.headerMap.get(ACCORD_HEADERS.versionResponse), "v0");
    assert.equal(res.headerMap.get(ACCORD_HEADERS.wwwAuthenticate), "Accord402");
    const body = bodyJson(res);
    assert.equal(body.error, ACCORD_GATEWAY_ERROR_CODES.ACCORD_PAYMENT_REQUIRED);
    assert.equal(body.agreement_template, TEMPLATE.agreement_template);
  });

  it("returns 402 UNKNOWN_AGREEMENT when resolveAgreement returns undefined", async () => {
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => undefined,
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000",
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 402);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.UNKNOWN_AGREEMENT);
  });

  it("returns 402 MISSING_PAYMENT when only the agreement-id is supplied", async () => {
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({ [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000" }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 402);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.MISSING_PAYMENT);
  });
});

// ── failure paths ──────────────────────────────────────────────────────────

describe("accordGateway — failure paths", () => {
  it("400 AGREEMENT_INVALID when validateAgreement rejects", async () => {
    const broken = minimalAgreement({ created_at: "not-a-date" } as never);
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => broken,
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: broken.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 400);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.AGREEMENT_INVALID);
  });

  it("402 PAYMENT_VERIFICATION_FAILED when the rail returns ok:false", async () => {
    const mw = accordGateway({
      rail: makeRail({
        verifyPayment: async () => ({
          ok: false,
          rail: "test",
          code: "INSUFFICIENT_VALUE",
          message: "value too low",
        }),
      }),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000",
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 402);
    assert.equal(
      bodyJson(res).error,
      ACCORD_GATEWAY_ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
    );
  });

  it("502 RAIL_UNAVAILABLE when the rail throws", async () => {
    const mw = accordGateway({
      rail: makeRail({
        verifyPayment: async () => {
          throw new Error("boom");
        },
      }),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000",
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 502);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.RAIL_UNAVAILABLE);
  });

  it("402 REPLAY_DETECTED when the same payment_id is presented twice", async () => {
    const replayStore = new InMemoryReplayStore();
    const mw = accordGateway({
      rail: makeRail({
        verifyPayment: async () => ({ ok: true, rail: "test", payment_id: "duplicate-1" }),
      }),
      replayStore,
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => ({ ok: true }),
    });
    const headers = {
      [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000",
      [ACCORD_HEADERS.payment]: '{"proof":"x"}',
    };

    // First call should succeed.
    const res1 = mockRes();
    await mw(reqWith(headers), res1, () => {});
    assert.equal(res1.statusCode, 200, `first call failed: ${res1.body}`);

    // Second call with the same payment_id should fail.
    const res2 = mockRes();
    await mw(reqWith(headers), res2, () => {});
    assert.equal(res2.statusCode, 402);
    assert.equal(bodyJson(res2).error, ACCORD_GATEWAY_ERROR_CODES.REPLAY_DETECTED);
  });

  it("400 TASK_OUTPUT_HASH_MISMATCH when the buyer's task-output hash doesn't match agreement.task.output_hash", async () => {
    const target = "different output";
    const expected = "blake2b256:0x" + accordHashV0(target);
    const ag = minimalAgreement({
      task: {
        kind: "summarise",
        input_ref: "inline:hi",
        description: "x",
        output_hash: expected,
      },
    });
    const mw = accordGateway({
      rail: makeRail({
        verifyPayment: async () => ({ ok: true, rail: "test", payment_id: "p1" }),
      }),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async () => "x",
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: ag.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
        [ACCORD_HEADERS.taskOutput]: "wrong output",
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 400);
    assert.equal(
      bodyJson(res).error,
      ACCORD_GATEWAY_ERROR_CODES.TASK_OUTPUT_HASH_MISMATCH,
    );
  });

  it("500 HANDLER_THREW when the seller's handler throws", async () => {
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => minimalAgreement(),
      handler: async () => {
        throw new Error("internal failure");
      },
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: "acc_01HX0000000000000000000000",
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 500);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.HANDLER_THREW);
  });

  it("422 VERIFICATION_REQUIRED when verification.required=true but no verifier is configured", async () => {
    const ag = minimalAgreement({
      verification: { required: true, method: "verifier_receipt", verifier: "verifier://x" },
    });
    const mw = accordGateway({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async () => ({ result: "ok" }),
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: ag.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 422);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.VERIFICATION_REQUIRED);
  });

  it("422 VERIFICATION_REJECTED when the verifier returns result=rejected", async () => {
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
    const mw = accordGateway({
      rail: makeRail(),
      verifier,
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async () => ({ result: "ok" }),
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: ag.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 422);
    assert.equal(bodyJson(res).error, ACCORD_GATEWAY_ERROR_CODES.VERIFICATION_REJECTED);
  });
});

// ── happy paths ─────────────────────────────────────────────────────────────

describe("accordGateway — happy paths", () => {
  it("200 returns the handler's output and Accord response headers", async () => {
    const ag = minimalAgreement();
    const mw = accordGateway<{ text?: string }, { word_count: number }>({
      rail: makeRail(),
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async (_req, { body }) => ({
        word_count: (body?.text ?? "").split(/\s+/).filter(Boolean).length,
      }),
    });
    const res = mockRes();
    await mw(
      reqWith(
        {
          [ACCORD_HEADERS.agreementId]: ag.agreement_id,
          [ACCORD_HEADERS.payment]: '{"proof":"x"}',
          "content-type": "application/json",
        },
        { text: "hello world" },
      ),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 200);
    const body = bodyJson(res);
    assert.deepEqual(body.output, { word_count: 2 });
    const meta = body._meta as Record<string, unknown>;
    assert.equal(meta.accord_agreement_id, ag.agreement_id);
    assert.match(String(meta.accord_agreement_hash), /^blake2b256:0x[0-9a-f]{64}$/);
    assert.equal(res.headerMap.get(ACCORD_HEADERS.versionResponse), "v0");
    assert.match(
      res.headerMap.get("x-accord-agreement-hash") ?? "",
      /^blake2b256:0x[0-9a-f]{64}$/,
    );
  });

  it("happy path with verifier + settle attaches both receipt hashes as response headers", async () => {
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
    const mw = accordGateway({
      rail: {
        rail: "ergo",
        verifyPayment: async () => ({ ok: true, rail: "ergo", payment_id: "tx-2" }),
        settle: async () => ({
          type: "accord.settlement_receipt.v0",
          version: "v0",
          settlement_id: "sr_01HX0000000000000000000000",
          agreement_id: ag.agreement_id,
          agreement_hash: "blake2b256:0x" + accordHashV0(ag),
          rail: "ergo",
          mode: "note_redeemed",
          status: "settled",
          amount: "1",
          currency: "ERG",
          decimals: 9,
          tx: {
            network: "testnet",
            tx_id: "0x" + "a".repeat(64),
            box_id: "0x" + "b".repeat(64),
          },
          created_at: "2026-05-07T00:00:20Z",
        }),
      },
      verifier,
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async () => ({ ok: true }),
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: ag.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 200, `failed: ${res.body}`);
    assert.match(
      res.headerMap.get("x-accord-verification-receipt-hash") ?? "",
      /^blake2b256:0x[0-9a-f]{64}$/,
    );
    assert.match(
      res.headerMap.get("x-accord-settlement-receipt-hash") ?? "",
      /^blake2b256:0x[0-9a-f]{64}$/,
    );
  });

  it("settle failure post-execution does not turn 200 into an error", async () => {
    const ag = minimalAgreement();
    const mw = accordGateway({
      rail: {
        rail: "ergo",
        verifyPayment: async () => ({ ok: true, rail: "ergo", payment_id: "tx-3" }),
        settle: async () => {
          throw new Error("rail down");
        },
      },
      buildAgreementTemplate: () => TEMPLATE,
      resolveAgreement: async () => ag,
      handler: async () => ({ ok: true }),
    });
    const res = mockRes();
    await mw(
      reqWith({
        [ACCORD_HEADERS.agreementId]: ag.agreement_id,
        [ACCORD_HEADERS.payment]: '{"proof":"x"}',
      }),
      res,
      () => {},
    );
    assert.equal(res.statusCode, 200);
    const body = bodyJson(res);
    assert.equal(
      (body._meta as Record<string, unknown>).accord_settlement_receipt,
      undefined,
    );
  });
});

// ── replay store unit ───────────────────────────────────────────────────────

describe("InMemoryReplayStore", () => {
  it("has() returns true after put() and false for unknown keys", () => {
    const s = new InMemoryReplayStore();
    assert.equal(s.has("ergo", "tx-a"), false);
    s.put("ergo", "tx-a", Date.now() + 1000);
    assert.equal(s.has("ergo", "tx-a"), true);
    assert.equal(s.has("ergo", "tx-b"), false);
  });

  it("expires entries past the TTL", () => {
    const s = new InMemoryReplayStore();
    s.put("ergo", "tx-a", Date.now() - 1); // already expired
    assert.equal(s.has("ergo", "tx-a"), false);
    assert.equal(s.size(), 0);
  });
});
