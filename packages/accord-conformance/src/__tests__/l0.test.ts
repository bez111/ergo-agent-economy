import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { runConformance, runL0 } from "../index.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

describe("conformance L0 — schema-compatibility", () => {
  it("passes against this repo's own fixtures", async () => {
    const result = await runL0({ repoRoot: REPO_ROOT });
    assert.equal(
      result.passed,
      true,
      `L0 unexpectedly failed:\n${result.checks
        .filter((c) => c.result !== "pass")
        .map((c) => `  ${c.id} ${c.result}: ${c.detail}`)
        .join("\n")}`,
    );
    assert.ok(result.passed_count > 0, "expected at least one passing check");
  });

  it("emits at least one check per fixture family + per fixture", async () => {
    const result = await runL0({ repoRoot: REPO_ROOT });
    const families = new Set(result.checks.map((c) => c.id.split(".")[2]));
    assert.ok(families.has("agreement"));
    assert.ok(families.has("verificationReceipt"));
    assert.ok(families.has("settlementReceipt"));
  });

  it("rejects fixtures whose names start with 'invalid-'", async () => {
    const result = await runL0({ repoRoot: REPO_ROOT });
    const rejectChecks = result.checks.filter((c) => c.id.includes(".invalid-"));
    assert.ok(rejectChecks.length > 0, "expected at least one reject-fixture check");
    for (const c of rejectChecks) {
      assert.equal(c.result, "pass", `${c.id} did not pass: ${c.detail}`);
    }
  });

  it("flags missing pinned hash files as 'inconclusive', not 'fail'", async () => {
    // Synthesize a tmp repoRoot with one valid fixture but no .hash.txt sidecar.
    const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "accord-conformance-"));
    try {
      // schemas/ — copy the real files so validation works
      const schemasOut = path.join(tmpDir, "schemas");
      fs.mkdirSync(schemasOut);
      for (const f of [
        "agreement.v0.schema.json",
        "verification-receipt.v0.schema.json",
        "settlement-receipt.v0.schema.json",
      ]) {
        fs.copyFileSync(path.join(REPO_ROOT, "schemas", f), path.join(schemasOut, f));
      }
      // test-vectors/ — only one fixture, no canonical / hash sidecars
      const vecOut = path.join(tmpDir, "test-vectors", "agreement", "v0");
      fs.mkdirSync(vecOut, { recursive: true });
      // empty fixture families for the other two
      fs.mkdirSync(path.join(tmpDir, "test-vectors", "verification-receipt", "v0"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "test-vectors", "settlement-receipt", "v0"), { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/agreement/v0/minimal.json"),
        path.join(vecOut, "minimal.json"),
      );
      // copy a fake placeholder so the verification-receipt + settlement-receipt
      // dirs aren't empty (which would itself be a fail)
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/verification-receipt/v0/accepted-minimal.json"),
        path.join(tmpDir, "test-vectors", "verification-receipt", "v0", "accepted-minimal.json"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/verification-receipt/v0/accepted-minimal.canonical.txt"),
        path.join(tmpDir, "test-vectors", "verification-receipt", "v0", "accepted-minimal.canonical.txt"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/verification-receipt/v0/accepted-minimal.hash.txt"),
        path.join(tmpDir, "test-vectors", "verification-receipt", "v0", "accepted-minimal.hash.txt"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/settlement-receipt/v0/ergo-note-redeemed.json"),
        path.join(tmpDir, "test-vectors", "settlement-receipt", "v0", "ergo-note-redeemed.json"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/settlement-receipt/v0/ergo-note-redeemed.canonical.txt"),
        path.join(tmpDir, "test-vectors", "settlement-receipt", "v0", "ergo-note-redeemed.canonical.txt"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/settlement-receipt/v0/ergo-note-redeemed.hash.txt"),
        path.join(tmpDir, "test-vectors", "settlement-receipt", "v0", "ergo-note-redeemed.hash.txt"),
      );

      const result = await runL0({ repoRoot: tmpDir });
      const minimalCanonicalCheck = result.checks.find(
        (c) => c.id === "L0.canonical.agreement.minimal",
      );
      const minimalHashCheck = result.checks.find(
        (c) => c.id === "L0.hash.agreement.minimal",
      );
      assert.equal(minimalCanonicalCheck?.result, "inconclusive");
      assert.equal(minimalHashCheck?.result, "inconclusive");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("achieved_level reports L0 when all L0 checks pass", async () => {
    const result = await runConformance({ repoRoot: REPO_ROOT, levels: ["L0"] });
    assert.equal(result.achieved_level, "L0");
  });

  it("achieved_level is null when L0 fails (synthetic broken fixture)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "accord-conformance-"));
    try {
      // Copy schemas
      fs.mkdirSync(path.join(tmpDir, "schemas"));
      for (const f of [
        "agreement.v0.schema.json",
        "verification-receipt.v0.schema.json",
        "settlement-receipt.v0.schema.json",
      ]) {
        fs.copyFileSync(path.join(REPO_ROOT, "schemas", f), path.join(tmpDir, "schemas", f));
      }
      // Drop a deliberately broken fixture (price.amount is a number, not a string)
      const dir = path.join(tmpDir, "test-vectors", "agreement", "v0");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "deliberately-broken.json"),
        JSON.stringify({
          type: "accord.agreement.v0",
          version: "v0",
          agreement_id: "acc_01HX0000000000000000000000",
          created_at: "2026-05-07T00:00:00Z",
          buyer: { id: "agent://buyer" },
          seller: { id: "provider://seller" },
          task: { kind: "x", input_ref: "inline:x", description: "x" },
          price: { amount: 1, currency: "ERG", decimals: 9 }, // number — should fail schema
          payment: { mode: "note", rail: "ergo", reserve_ref: "ergo:box:" + "a".repeat(64), deadline: "+1 blocks" },
          verification: { required: false, method: "none" },
          settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
        }),
      );
      // Empty other families with a valid fixture each so the suite runs
      fs.mkdirSync(path.join(tmpDir, "test-vectors", "verification-receipt", "v0"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "test-vectors", "settlement-receipt", "v0"), { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/verification-receipt/v0/accepted-minimal.json"),
        path.join(tmpDir, "test-vectors", "verification-receipt", "v0", "accepted-minimal.json"),
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, "test-vectors/settlement-receipt/v0/ergo-note-redeemed.json"),
        path.join(tmpDir, "test-vectors", "settlement-receipt", "v0", "ergo-note-redeemed.json"),
      );

      const result = await runConformance({ repoRoot: tmpDir, levels: ["L0"] });
      assert.equal(result.achieved_level, null);
      const l0 = result.levels.find((l) => l.level === "L0");
      assert.equal(l0?.passed, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("conformance — multi-level coordination", () => {
  it("L3 / L4 are explicitly out of scope at v0", async () => {
    const result = await runConformance({ repoRoot: REPO_ROOT, levels: ["L0", "L3", "L4"] });
    const l3 = result.levels.find((l) => l.level === "L3");
    const l4 = result.levels.find((l) => l.level === "L4");
    assert.match(l3?.checks[0]?.detail ?? "", /per-rail/);
    assert.match(l4?.checks[0]?.detail ?? "", /registry-side/i);
  });
});
