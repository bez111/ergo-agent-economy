import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runConformance, runL2 } from "../index.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

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
});
