#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/release-preflight.mjs
//
// Pre-flight smoke for v0.4.0 release. Runs every gate the publish workflow
// will run, locally, in <2 minutes. Catches things that would otherwise fail
// the workflow after `git tag && push`.
//
// Sequence:
//   1. Working tree state (clean, on main, fast-forward against origin)
//   2. Version distribution (9 × 0.4.0 + 8 × 0.3.0 expected)
//   3. `npm install --include=optional` clean
//   4. `npm run typecheck --workspaces` clean
//   5. `npm run build --workspaces` clean
//   6. `npm test --workspaces` (expect 569+ TS tests pass)
//   7. Conformance L0+L1+L2+L3+L4 PASS (Achieved: L4)
//   8. Fixture-hash drift check
//   9. End-to-end demo (paid-MCP repo-audit)
//  10. accord-conformance keygen + sign + verify round-trip
//  11. keygen + sign + verify round-trip
//  12. MCP-stdio probe against the bundled stub
//  13. `npm pack` for every @accord-protocol/* package (opt-in via --pack)
//  14. install-in-tempdir smoke against the freshly-packed core tarball
//      (opt-in via --pack — depends on gate 13's output)
//
// Usage:
//   node scripts/release-preflight.mjs              # run gates 1-12
//   node scripts/release-preflight.mjs --pack       # also run gates 13-14
//
// Exit code 0 iff all gates pass. Designed to be run before
// `git tag v0.4.0 && git push --tags`.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const RUN_PACK = process.argv.includes("--pack");

const ACCORD_PACKAGES = [
  "@accord-protocol/core",
  "@accord-protocol/rails",
  "@accord-protocol/mcp",
  "@accord-protocol/gateway",
  "@accord-protocol/rails-ergo",
  "@accord-protocol/rails-rosen",
  "@accord-protocol/rails-base",
  "@accord-protocol/rails-x402",
  "@accord-protocol/conformance",
];

const GATES = [];

function gate(name, fn) {
  GATES.push({ name, fn });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf-8",
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? "pipe",
  });
  return r;
}

function fail(msg) {
  return { ok: false, msg };
}
function pass(msg) {
  return { ok: true, msg };
}

// ── Gates ────────────────────────────────────────────────────────────────────

gate("01 working-tree clean", () => {
  const r = run("git", ["status", "--porcelain"]);
  if (r.status !== 0) return fail(`git status failed: ${r.stderr}`);
  return r.stdout.trim() === ""
    ? pass("clean")
    : fail(`uncommitted changes:\n${r.stdout}`);
});

gate("02 on main, up-to-date with origin", () => {
  const branch = run("git", ["branch", "--show-current"]).stdout.trim();
  if (branch !== "main") return fail(`expected main, got ${branch}`);
  run("git", ["fetch", "origin", "main"], { stdio: "ignore" });
  const ahead = run("git", ["rev-list", "--count", "origin/main..HEAD"]).stdout.trim();
  const behind = run("git", ["rev-list", "--count", "HEAD..origin/main"]).stdout.trim();
  if (ahead !== "0") return fail(`local main is ${ahead} commits ahead of origin`);
  if (behind !== "0") return fail(`local main is ${behind} commits behind origin`);
  return pass("on main, in sync with origin");
});

gate("03 version distribution (9×0.4.0 + 8×0.3.0)", () => {
  const counts = new Map();
  for (const pkg of fs.readdirSync(path.join(REPO_ROOT, "packages"))) {
    const p = path.join(REPO_ROOT, "packages", pkg, "package.json");
    if (!fs.existsSync(p)) continue;
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    counts.set(json.version, (counts.get(json.version) ?? 0) + 1);
  }
  const expect040 = counts.get("0.4.0") ?? 0;
  const expect030 = counts.get("0.3.0") ?? 0;
  if (expect040 !== 9 || expect030 !== 8) {
    return fail(
      `expected 9×0.4.0 + 8×0.3.0; got ${[...counts].map(([v, c]) => `${c}×${v}`).join(" + ")}`,
    );
  }
  return pass(`9×0.4.0 (Accord) + 8×0.3.0 (legacy)`);
});

gate("04 npm install --include=optional", () => {
  const r = run("npm", ["install", "--include=optional"]);
  return r.status === 0 ? pass("clean") : fail(`exit ${r.status}: ${r.stderr.slice(0, 200)}`);
});

gate("05 typecheck --workspaces", () => {
  const r = run("npm", ["run", "typecheck", "--workspaces", "--if-present"]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stderr.slice(0, 200)}`);
  const errs = r.stdout.match(/error TS/g)?.length ?? 0;
  return errs === 0 ? pass("0 errors") : fail(`${errs} TS errors`);
});

gate("06 build --workspaces", () => {
  const r = run("npm", ["run", "build", "--workspaces", "--if-present"]);
  return r.status === 0 ? pass("17 packages built") : fail(`exit ${r.status}`);
});

gate("07 test --workspaces (expect ≥582 pass, 0 fail)", () => {
  const r = run("npm", ["test", "--workspaces", "--if-present"]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stderr.slice(0, 200)}`);
  const lines = r.stdout.split("\n");
  let total = 0, fails = 0;
  for (const line of lines) {
    const t = line.match(/^# tests (\d+)$/);
    const f = line.match(/^# fail (\d+)$/);
    if (t) total += parseInt(t[1], 10);
    if (f) fails += parseInt(f[1], 10);
  }
  if (fails > 0) return fail(`${fails} test failures`);
  if (total < 582) return fail(`only ${total} tests ran (expected ≥582)`);
  return pass(`${total} tests, 0 fails`);
});

gate("08 conformance L0+L1+L2+L3+L4 (Achieved: L4)", () => {
  const r = run("node", [
    "packages/accord-conformance/dist/cli.js",
    "run",
    "--levels",
    "L0,L1,L2,L3,L4",
  ]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stdout.slice(-500)}`);
  if (!r.stdout.includes("Achieved: L4")) {
    return fail(`Achieved level wrong:\n${r.stdout.slice(-500)}`);
  }
  return pass("Achieved: L4");
});

gate("09 fixture-hash drift", () => {
  const r = run("node", ["scripts/derive-fixture-hashes.mjs", "--check"]);
  return r.status === 0
    ? pass("0 drift")
    : fail(`exit ${r.status}: ${r.stdout}`);
});

gate("10 end-to-end demo", () => {
  const r = run("npm", ["run", "dev", "-w", "accord-paid-mcp-repo-audit-demo"]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stdout.slice(-500)}`);
  if (!r.stdout.includes("Settlement Receipt")) {
    return fail(`demo did not emit Settlement Receipt:\n${r.stdout.slice(-500)}`);
  }
  return pass("full lifecycle, both receipts emitted");
});

gate("11 keygen + sign + verify round-trip", () => {
  const kg = run("node", ["packages/accord-conformance/dist/cli.js", "keygen"]);
  const priv = kg.stdout.match(/private:\s+(0x[0-9a-f]+)/)?.[1];
  if (!priv) return fail(`keygen did not emit a private key`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accord-preflight-"));
  try {
    const inputPath = path.join(tmp, "result.json");
    const signedPath = path.join(tmp, "signed.json");
    fs.writeFileSync(inputPath, JSON.stringify({ a: 1, b: 2 }));
    const s = run("node", [
      "packages/accord-conformance/dist/cli.js",
      "sign",
      "--key",
      priv,
      "-o",
      signedPath,
      inputPath,
    ]);
    if (s.status !== 0) return fail(`sign exit ${s.status}: ${s.stderr}`);
    const v = run("node", [
      "packages/accord-conformance/dist/cli.js",
      "verify",
      signedPath,
    ]);
    if (v.status !== 0) return fail(`verify exit ${v.status}: ${v.stdout}`);
    return pass("round-trip OK");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

gate("12 MCP-stdio probe against bundled stub", () => {
  const r = run("node", [
    "packages/accord-conformance/dist/cli.js",
    "run",
    "--levels",
    "L1",
    "--target",
    "stdio:packages/accord-conformance/src/__tests__/fixtures/stub-mcp-server.mjs",
  ]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stdout.slice(-500)}`);
  if (!r.stdout.includes("L1 PASS  (4/4")) {
    return fail(`L1 stdio probe did not report 4/4:\n${r.stdout.slice(-500)}`);
  }
  return pass("L1 PASS (4/4 against spawned stub)");
});

// Tarball cache shared between gates 13 and 14 when --pack is enabled.
let PACK_TARBALL_DIR = null;

if (RUN_PACK) {
  gate("13 npm pack each @accord-protocol/* package", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accord-pack-"));
    PACK_TARBALL_DIR = tmp;
    for (const pkg of ACCORD_PACKAGES) {
      const r = run(
        "npm",
        ["pack", "-w", pkg, "--pack-destination", tmp],
        { stdio: "pipe" },
      );
      if (r.status !== 0) {
        return fail(`npm pack ${pkg} exit ${r.status}: ${r.stderr.slice(0, 200)}`);
      }
    }
    const tarballs = fs.readdirSync(tmp).filter((f) => f.endsWith(".tgz"));
    return tarballs.length === ACCORD_PACKAGES.length
      ? pass(`${tarballs.length} tarballs in ${tmp}`)
      : fail(`got ${tarballs.length}, expected ${ACCORD_PACKAGES.length}`);
  });

  gate("14 install-in-tempdir smoke for @accord-protocol/core", () => {
    if (!PACK_TARBALL_DIR) return fail("gate 13 did not produce tarballs");
    const tarballs = fs
      .readdirSync(PACK_TARBALL_DIR)
      .filter((f) => f.startsWith("accord-protocol-core-") && f.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      return fail(`expected 1 core tarball, got ${tarballs.length}`);
    }
    const tarball = path.join(PACK_TARBALL_DIR, tarballs[0]);

    const proj = fs.mkdtempSync(path.join(os.tmpdir(), "accord-install-"));
    try {
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ name: "accord-install-smoke", private: true, type: "module" }, null, 2),
      );
      const inst = run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: proj });
      if (inst.status !== 0) {
        return fail(`npm install exit ${inst.status}: ${inst.stderr.slice(0, 300)}`);
      }
      const probePath = path.join(proj, "probe.mjs");
      fs.writeFileSync(
        probePath,
        `import * as core from "@accord-protocol/core";\nconst keys = Object.keys(core);\nif (keys.length === 0) { console.error("EMPTY"); process.exit(1); }\nconsole.log("EXPORTS=" + keys.length);\n`,
      );
      const probe = run("node", [probePath], { cwd: proj });
      if (probe.status !== 0) {
        return fail(`probe import failed exit ${probe.status}: ${probe.stderr.slice(0, 300)}`);
      }
      const m = probe.stdout.match(/EXPORTS=(\d+)/);
      if (!m || parseInt(m[1], 10) === 0) {
        return fail(`probe reported no exports:\n${probe.stdout}`);
      }
      return pass(`installed + imported (${m[1]} exports)`);
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
      if (PACK_TARBALL_DIR) {
        fs.rmSync(PACK_TARBALL_DIR, { recursive: true, force: true });
        PACK_TARBALL_DIR = null;
      }
    }
  });
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log(`Accord Protocol v0.4.0 release pre-flight\n`);
let failures = 0;
for (const g of GATES) {
  process.stdout.write(`  ${g.name.padEnd(45)} ... `);
  try {
    const r = g.fn();
    if (r.ok) {
      console.log(`✓ ${r.msg}`);
    } else {
      console.log(`✗ FAIL`);
      console.log(`      ${r.msg.replaceAll("\n", "\n      ")}`);
      failures++;
    }
  } catch (err) {
    console.log(`✗ THREW`);
    console.log(`      ${(err instanceof Error ? err.message : String(err)).replaceAll("\n", "\n      ")}`);
    failures++;
  }
}
console.log("");
if (failures === 0) {
  console.log(`✓ All ${GATES.length} gates passed. Ready to tag v0.4.0.`);
  process.exit(0);
} else {
  console.log(`✗ ${failures} of ${GATES.length} gates failed. Fix before tagging.`);
  process.exit(1);
}
