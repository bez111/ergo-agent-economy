import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { accordHashV0 } from "@accord-protocol/core";
import { runConformance, runL2 } from "../index.js";
import type {
  AccordAgreement,
  AccordSettlementReceipt,
} from "@accord-protocol/core";
import type { AccordRailAdapter } from "@accord-protocol/rails";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

function buildExtraRailAgreement(): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0L2EXTRARAILMISMATCH001",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://l2-extra-buyer" },
    seller: { id: "provider://l2-extra-seller" },
    task: { kind: "ping", input_ref: "inline:hi", description: "L2 mismatch test" },
    price: { amount: "0.001", currency: "ERG", decimals: 9 },
    payment: {
      mode: "note",
      rail: "ergo",
      reserve_ref: "ergo:box:" + "ab".repeat(32),
      deadline: "+480 blocks",
    },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
  };
}

function buildSettlementReceipt(
  agreement: AccordAgreement,
  overrides: Partial<AccordSettlementReceipt> = {},
): AccordSettlementReceipt {
  return {
    type: "accord.settlement_receipt.v0",
    version: "v0",
    settlement_id: "sr_01HX0L2EXTRARAILMISMATCH01",
    agreement_id: agreement.agreement_id,
    agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
    rail: "ergo",
    mode: "note_redeemed",
    status: "settled",
    amount: agreement.price.amount,
    currency: agreement.price.currency,
    decimals: agreement.price.decimals,
    tx: {
      network: "testnet",
      tx_id: "0x" + "c".repeat(64),
      box_id: "0x" + "d".repeat(64),
    },
    created_at: "2026-05-07T00:00:20Z",
    ...overrides,
  };
}

function extraRailWithSettlement(
  settleReceipt: (agreement: AccordAgreement) => AccordSettlementReceipt,
) {
  const adapter: AccordRailAdapter = {
    rail: "ergo",
    async verifyPayment({ payment }) {
      const p = payment as { ok?: boolean };
      if (p.ok) {
        return { ok: true, rail: "ergo", payment_id: "l2-extra-payment" };
      }
      return {
        ok: false,
        rail: "ergo",
        code: "BAD_PAYMENT",
        message: "bad payment",
      };
    },
    async settle({ agreement }) {
      return settleReceipt(agreement);
    },
  };

  return {
    rail: "ergo" as const,
    adapter,
    buildAgreement: buildExtraRailAgreement,
    buildPayment: () => ({ ok: true }),
    badPayment: { ok: false },
  };
}

describe("conformance L2 — rail-compatibility", () => {
  it("passes against the four reference rails", async () => {
    const result = await runL2();
    const fails = result.checks.filter((c) => c.result !== "pass");
    assert.equal(
      result.passed,
      true,
      `L2 unexpectedly failed:\n${fails
        .map((c) => `  ${c.id} ${c.result}: ${c.detail}`)
        .join("\n")}`,
    );
    // 4 rails × 6 checks (verify-happy, payment-id-shape, settle-completes,
    // settle-receipt-valid, mode-allow-list, verify-rejection) = 24 checks
    assert.equal(result.passed_count, 24, `expected 24 passes, got ${result.passed_count}`);
  });

  it("each rail produces its own check namespace", async () => {
    const result = await runL2();
    for (const rail of ["ergo", "rosen", "base", "x402"]) {
      const ids = result.checks.filter((c) => c.id.startsWith(`L2.${rail}.`));
      assert.ok(
        ids.length >= 5,
        `expected ≥5 checks for rail '${rail}', got ${ids.length}`,
      );
    }
  });

  it("achieved_level reports L2 when L0 + L1 + L2 all pass", async () => {
    const result = await runConformance({
      repoRoot: REPO_ROOT,
      levels: ["L0", "L1", "L2"],
    });
    assert.equal(result.achieved_level, "L2");
  });

  it("settle-receipt-valid + mode-allow-list checks pass for every rail", async () => {
    const result = await runL2();
    for (const rail of ["ergo", "rosen", "base", "x402"]) {
      const settleValid = result.checks.find(
        (c) => c.id === `L2.${rail}.settle.receipt-valid`,
      );
      const modeOK = result.checks.find(
        (c) => c.id === `L2.${rail}.settle.mode-allow-list`,
      );
      assert.equal(settleValid?.result, "pass", `${rail} receipt invalid: ${settleValid?.detail}`);
      assert.equal(modeOK?.result, "pass", `${rail} mode rejected: ${modeOK?.detail}`);
    }
  });

  it("fails a rail whose Settlement Receipt hash is not bound to the Agreement", async () => {
    const result = await runL2({
      extraRails: [
        extraRailWithSettlement((agreement) =>
          buildSettlementReceipt(agreement, {
            agreement_hash: "blake2b256:0x" + "0".repeat(64),
          }),
        ),
      ],
    });
    const failures = result.checks.filter(
      (c) => c.id === "L2.ergo.settle.receipt-valid" && c.result === "fail",
    );
    assert.equal(result.passed, false);
    assert.ok(
      failures.some((c) => c.detail?.includes("ACCORD_HASH_MISMATCH")),
      `expected ACCORD_HASH_MISMATCH, got:\n${failures.map((c) => c.detail).join("\n")}`,
    );
  });

  it("fails a rail whose Settlement Receipt rail or currency differs from the Agreement", async () => {
    const result = await runL2({
      extraRails: [
        extraRailWithSettlement((agreement) =>
          buildSettlementReceipt(agreement, {
            rail: "x402",
            mode: "paid_before_response",
            currency: "USDC",
            decimals: 6,
            tx: {
              network: "base-sepolia",
              tx_id: "0x" + "e".repeat(64),
            },
          }),
        ),
      ],
    });
    const failures = result.checks.filter(
      (c) => c.id === "L2.ergo.settle.receipt-valid" && c.result === "fail",
    );
    assert.equal(result.passed, false);
    assert.ok(
      failures.some(
        (c) =>
          c.detail?.includes("ACCORD_RAIL_MISMATCH") &&
          c.detail.includes("ACCORD_CURRENCY_MISMATCH"),
      ),
      `expected rail + currency mismatch, got:\n${failures.map((c) => c.detail).join("\n")}`,
    );
  });
});
