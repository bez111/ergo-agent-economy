// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — L2 rail-compatibility checks
//
// "At least one rail adapter passes verifyPayment + settle."
//
// We probe each of the four reference rails (rails-ergo, rails-rosen,
// rails-base, rails-x402) with a stub backend and assert each rail:
//
//   1. accepts a happy-path payment (verifyPayment returns ok=true)
//   2. emits a stable payment_id (string, not whitespace)
//   3. emits a Settlement Receipt that passes core's
//      validateSettlementReceipt against the same Agreement
//   4. respects the per-rail mode allow-list (RAIL_MODE_ALLOWLIST)
//   5. rejects an obviously-bad payment (sanity rejection)
//
// L2 is a "harness conformance" check — the implementation under test is
// any rail adapter conforming to AccordRailAdapter from @accord-protocol/
// rails. PR-019 ships the four reference rails wired up; a third-party
// rail can be tested with the same harness by passing it via runL2's
// `extraRails` option.
// ─────────────────────────────────────────────────────────────────────────────

import { blake2b } from "@noble/hashes/blake2";
import { keccak_256 } from "@noble/hashes/sha3";

import {
  RAIL_MODE_ALLOWLIST,
  validateSettlementReceipt,
  type AccordAgreement,
  type AccordRail,
} from "@accord-protocol/core";

import type {
  AccordRailAdapter,
  VerifyPaymentInput,
} from "@accord-protocol/rails";

import { createErgoRailAdapter } from "@accord-protocol/rails-ergo";
import { createRosenRailAdapter } from "@accord-protocol/rails-rosen";
import { createBaseRailAdapter } from "@accord-protocol/rails-base";
import { createX402RailAdapter } from "@accord-protocol/rails-x402";

import type { ConformanceCheck, ConformanceLevelResult } from "./types.js";

interface RailUnderTest {
  rail: AccordRail;
  adapter: AccordRailAdapter;
  /** Build a happy-path agreement aligned with this rail. */
  buildAgreement: () => AccordAgreement;
  /** Build a happy-path buyer-supplied payment proof. */
  buildPayment: (agreement: AccordAgreement) => unknown;
  /** A clearly-bad payment to feed verifyPayment for the rejection check. */
  badPayment: unknown;
}

interface RunL2Options {
  /** Extra rails to test (e.g. third-party adapters). */
  extraRails?: RailUnderTest[];
}

export async function runL2(opts: RunL2Options = {}): Promise<ConformanceLevelResult> {
  const checks: ConformanceCheck[] = [];

  const railsUnderTest = [...buildReferenceRails(), ...(opts.extraRails ?? [])];

  for (const r of railsUnderTest) {
    await runChecksForRail(r, checks);
  }

  return summarise(checks);
}

async function runChecksForRail(
  r: RailUnderTest,
  checks: ConformanceCheck[],
): Promise<void> {
  const agreement = r.buildAgreement();
  const payment = r.buildPayment(agreement);
  const prefix = `L2.${r.rail}`;

  // 1. verifyPayment happy path
  const t0 = Date.now();
  let verifyResult: Awaited<ReturnType<AccordRailAdapter["verifyPayment"]>>;
  try {
    verifyResult = await r.adapter.verifyPayment({ agreement, payment } as VerifyPaymentInput);
  } catch (err) {
    checks.push({
      id: `${prefix}.verify-payment.happy`,
      level: "L2",
      description: `${r.rail}: verifyPayment(happy) returns ok`,
      result: "fail",
      detail: `verifyPayment threw: ${stringifyError(err)}`,
    });
    return;
  }

  const verifyOk = verifyResult.ok === true;
  checks.push({
    id: `${prefix}.verify-payment.happy`,
    level: "L2",
    description: `${r.rail}: verifyPayment(happy) returns ok`,
    result: verifyOk ? "pass" : "fail",
    detail: verifyOk
      ? undefined
      : `got { ok: false, code: ${(verifyResult as { code?: string }).code} }`,
    duration_ms: Date.now() - t0,
  });

  if (!verifyResult.ok) {
    return;
  }

  // 2. payment_id is a non-empty string
  const paymentId = verifyResult.payment_id;
  const goodId =
    typeof paymentId === "string" && paymentId.length > 0 && paymentId.trim() === paymentId;
  checks.push({
    id: `${prefix}.payment-id.shape`,
    level: "L2",
    description: `${r.rail}: payment_id is a non-empty, untrimmed string`,
    result: goodId ? "pass" : "fail",
    detail: goodId ? undefined : `got ${JSON.stringify(paymentId)}`,
  });

  // 3. settle emits a valid Settlement Receipt
  if (!r.adapter.settle) {
    checks.push({
      id: `${prefix}.settle.present`,
      level: "L2",
      description: `${r.rail}: rail.settle is implemented`,
      result: "fail",
      detail: "rail.settle is undefined; L2 requires settle()",
    });
    return;
  }
  let receipt;
  try {
    receipt = await r.adapter.settle({ agreement, payment });
  } catch (err) {
    checks.push({
      id: `${prefix}.settle.completes`,
      level: "L2",
      description: `${r.rail}: rail.settle(happy) returns a Settlement Receipt`,
      result: "fail",
      detail: `settle threw: ${stringifyError(err)}`,
    });
    return;
  }
  checks.push({
    id: `${prefix}.settle.completes`,
    level: "L2",
    description: `${r.rail}: rail.settle(happy) returns a Settlement Receipt`,
    result: "pass",
  });

  // 4. Settlement Receipt passes core validation
  const v = validateSettlementReceipt(receipt, { agreement });
  checks.push({
    id: `${prefix}.settle.receipt-valid`,
    level: "L2",
    description: `${r.rail}: Settlement Receipt passes core validateSettlementReceipt`,
    result: v.ok ? "pass" : "fail",
    detail: v.ok ? undefined : v.problems.map((p) => p.code + "@" + p.path).join(", "),
  });

  // 5. mode is in the per-rail allow-list
  const allowed = RAIL_MODE_ALLOWLIST[receipt.rail as AccordRail];
  const modeAllowed = allowed?.includes(receipt.mode) ?? false;
  checks.push({
    id: `${prefix}.settle.mode-allow-list`,
    level: "L2",
    description: `${r.rail}: receipt.mode ∈ RAIL_MODE_ALLOWLIST[${receipt.rail}]`,
    result: modeAllowed ? "pass" : "fail",
    detail: modeAllowed
      ? undefined
      : `mode=${receipt.mode} not in [${(allowed ?? []).join(", ")}]`,
  });

  // 6. obvious bad payment is rejected (no throw, structured ok=false)
  let badResult;
  try {
    badResult = await r.adapter.verifyPayment({
      agreement,
      payment: r.badPayment,
    } as VerifyPaymentInput);
  } catch (err) {
    // Acceptable if the rail throws on garbage — but pref ok:false. We
    // count both as "pass" but log the exception path as a detail.
    checks.push({
      id: `${prefix}.verify-payment.rejection`,
      level: "L2",
      description: `${r.rail}: verifyPayment(garbage) does not return ok=true`,
      result: "pass",
      detail: `threw instead of returning structured rejection: ${stringifyError(err)}`,
    });
    return;
  }
  const properlyRejected = badResult.ok === false;
  checks.push({
    id: `${prefix}.verify-payment.rejection`,
    level: "L2",
    description: `${r.rail}: verifyPayment(garbage) does not return ok=true`,
    result: properlyRejected ? "pass" : "fail",
    detail: properlyRejected
      ? undefined
      : `garbage payment was accepted; got ok=true with payment_id=${(badResult as { payment_id?: string }).payment_id}`,
  });
}

// ── reference rails ─────────────────────────────────────────────────────────

function buildReferenceRails(): RailUnderTest[] {
  return [ergoRail(), rosenRail(), baseRail(), x402Rail()];
}

// Common agreement skeleton — each rail customises currency / payment.rail.
function baseAgreement(overrides: Partial<AccordAgreement>): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0L2RAILTESTAAAAAAAAAAA",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://l2-buyer" },
    seller: { id: "provider://l2-seller" },
    task: { kind: "ping", input_ref: "inline:hi", description: "L2 conformance" },
    price: { amount: "0.001", currency: "ERG", decimals: 9 },
    payment: { mode: "note", rail: "ergo", reserve_ref: "ergo:box:" + "ab".repeat(32), deadline: "+480 blocks" },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
    ...overrides,
  };
}

// ── Ergo rail ───────────────────────────────────────────────────────────────

function ergoRail(): RailUnderTest {
  const NOTE_BOX_ID = "a".repeat(64);
  const RESERVE_BOX_ID = "b".repeat(64);
  const TASK_OUTPUT = '{"word_count":2}';
  const TASK_HASH = blake2bHex(TASK_OUTPUT);

  const adapter = createErgoRailAdapter({
    ops: {
      network: "testnet",
      checkNote: async () => ({
        boxId: NOTE_BOX_ID,
        value: 1_000_000n,
        expiryBlock: 1_000_000,
        currentBlock: 999_500,
        isExpired: false,
        reserveBoxId: RESERVE_BOX_ID,
        taskHash: TASK_HASH,
      }),
      redeemNote: async () => ({ txId: "c".repeat(64), submitted: true }),
    },
  });

  return {
    rail: "ergo",
    adapter,
    buildAgreement: () =>
      baseAgreement({
        price: { amount: "0.001", currency: "ERG", decimals: 9 },
        payment: {
          mode: "note",
          rail: "ergo",
          reserve_ref: `ergo:box:${RESERVE_BOX_ID}`,
          deadline: "+480 blocks",
        },
      }),
    buildPayment: () => ({ note_box_id: NOTE_BOX_ID, task_output: TASK_OUTPUT }),
    badPayment: { note_box_id: "nope", task_output: "x" },
  };
}

// ── Rosen rail ──────────────────────────────────────────────────────────────

function rosenRail(): RailUnderTest {
  const NOTE_BOX_ID = "1".repeat(64);
  const RESERVE_BOX_ID = "2".repeat(64);
  const RS_USDT_TOKEN = "3".repeat(64);
  const TASK_OUTPUT = '{"word_count":2}';
  const TASK_HASH = blake2bHex(TASK_OUTPUT);

  const adapter = createRosenRailAdapter({
    ops: {
      network: "testnet",
      checkNote: async () => ({
        boxId: NOTE_BOX_ID,
        value: 1_000_000n,
        expiryBlock: 1_000_000,
        currentBlock: 999_500,
        isExpired: false,
        reserveBoxId: RESERVE_BOX_ID,
        taskHash: TASK_HASH,
        tokens: [{ tokenId: RS_USDT_TOKEN, amount: 50_000n }],
      }),
      redeemNote: async () => ({ txId: "4".repeat(64), submitted: true }),
    },
    tokens: {
      rsUSDT: { tokenId: RS_USDT_TOKEN, decimals: 6 },
    },
  });

  return {
    rail: "rosen",
    adapter,
    buildAgreement: () =>
      baseAgreement({
        price: { amount: "0.05", currency: "rsUSDT", decimals: 6 },
        payment: {
          mode: "note",
          rail: "rosen",
          reserve_ref: `ergo:box:${RESERVE_BOX_ID}`,
          deadline: "+480 blocks",
        },
      }),
    buildPayment: () => ({ note_box_id: NOTE_BOX_ID, task_output: TASK_OUTPUT }),
    badPayment: { note_box_id: "x", task_output: "y" },
  };
}

// ── Base rail ───────────────────────────────────────────────────────────────

function baseRail(): RailUnderTest {
  const NOTE_ID = `0x${"a".repeat(64)}` as const;
  const TX_HASH = `0x${"b".repeat(64)}` as const;
  const TASK_OUTPUT = '{"word_count":2}';
  const TASK_HASH = `0x${keccak256Hex(TASK_OUTPUT)}` as `0x${string}`;

  const adapter = createBaseRailAdapter({
    ops: {
      network: "base-sepolia",
      checkNote: async () => ({
        noteId: NOTE_ID,
        issuer: `0x${"1".repeat(40)}` as `0x${string}`,
        recipient: `0x${"2".repeat(40)}` as `0x${string}`,
        amount: 50_000n,
        expiryBlock: 100n,
        currentBlock: 50n,
        isExpired: false,
        redeemed: false,
        exists: true,
        taskHash: TASK_HASH,
      }),
      redeemNote: async () => ({ txHash: `0x${"c".repeat(64)}` as `0x${string}` }),
    },
  });

  return {
    rail: "base",
    adapter,
    buildAgreement: () =>
      baseAgreement({
        price: { amount: "0.05", currency: "USDC", decimals: 6 },
        payment: { mode: "pay_before_response", rail: "base", deadline: "+30 seconds" },
      }),
    buildPayment: () => ({ note_id: NOTE_ID, task_output: TASK_OUTPUT, tx_hash: TX_HASH }),
    badPayment: { note_id: "0xshort", task_output: "x" },
  };
}

// ── x402 rail ───────────────────────────────────────────────────────────────

function x402Rail(): RailUnderTest {
  const adapter = createX402RailAdapter({
    facilitator: {
      network: "base-sepolia",
      verify: async () => ({
        ok: true,
        payment_id: `0x${"d".repeat(64)}`,
        scheme: "exact",
        payer: `0x${"5".repeat(40)}`,
      }),
      settle: async () => ({
        tx_hash: `0x${"e".repeat(64)}`,
        block_height: 100,
      }),
    },
  });

  return {
    rail: "x402",
    adapter,
    buildAgreement: () =>
      baseAgreement({
        price: { amount: "0.05", currency: "USDC", decimals: 6 },
        payment: { mode: "pay_before_response", rail: "x402", deadline: "+30 seconds" },
      }),
    buildPayment: () => ({ x402_payment_payload: "base64-payload", scheme: "exact" }),
    badPayment: { scheme: "exact" },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function summarise(checks: ConformanceCheck[]): ConformanceLevelResult {
  return {
    level: "L2",
    passed: checks.every((c) => c.result === "pass") && checks.length > 0,
    passed_count: checks.filter((c) => c.result === "pass").length,
    failed_count: checks.filter((c) => c.result === "fail").length,
    inconclusive_count: checks.filter((c) => c.result === "inconclusive").length,
    checks,
  };
}

function blake2bHex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const digest = blake2b(bytes, { dkLen: 32 });
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    out += (digest[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function keccak256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const digest = keccak_256(bytes);
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    out += (digest[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
