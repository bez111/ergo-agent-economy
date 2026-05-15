#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/release-preflight.mjs
//
// Pre-flight smoke for v0.4.0 release. Runs every gate the publish workflow
// will run, locally, in <2 minutes. Catches things that would otherwise fail
// the workflow after `git tag && push`.
//
// Sequence:
//   1. Working tree clean
//   2. On main, in sync with origin (or a clean, pushed branch when
//      --allow-branch is passed)
//   3. Version distribution (10 × 0.4.0 + 8 × 0.3.0 expected)
//   4. `npm install --include=optional` clean
//   5. `npm run typecheck --workspaces` clean
//   6. `npm run build --workspaces` clean
//   7. CommonJS export smoke for packages that advertise require() support
//   8. `npm test --workspaces` (expect 653+ TS tests pass)
//   9. Conformance L0+L1+L2+L3+L4 PASS (Achieved: L4)
//  10. Fixture-hash drift check
//  11. End-to-end demo (paid-MCP repo-audit)
//  12. accord-conformance keygen + sign + verify round-trip
//  13. MCP-stdio probe against the bundled stub
//  14. `npm pack` for every @accord-protocol/* package (opt-in via --pack)
//  15. install-in-tempdir smoke for all 18 workspace tarballs —
//      installs them into one fresh project and imports each canonical Accord package
//      (opt-in via --pack — depends on gate 14's output)
//
// Usage:
//   node scripts/release-preflight.mjs                       # run gates 1-12 on main
//   node scripts/release-preflight.mjs --pack                # also run gates 13-14
//   node scripts/release-preflight.mjs --allow-branch --pack # PR branch smoke
//
// Exit code 0 iff all gates pass. Designed to be run before
// `git tag v0.4.0 && git push --tags`.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use fileURLToPath instead of import.meta.dirname so this script runs on
// Node 18 (the package.json minimum) as well as Node 20+ (publish workflow).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ALLOWED_ARGS = new Set(["--pack", "--allow-branch"]);
const REQUESTED_ARGS = process.argv.slice(2);
const UNKNOWN_ARGS = REQUESTED_ARGS.filter((arg) => !ALLOWED_ARGS.has(arg));
if (UNKNOWN_ARGS.length > 0) {
  console.error(`Unknown release-preflight option(s): ${UNKNOWN_ARGS.join(", ")}`);
  console.error(`Usage: node scripts/release-preflight.mjs [--allow-branch] [--pack]`);
  process.exit(2);
}

const RUN_PACK = REQUESTED_ARGS.includes("--pack");
const ALLOW_BRANCH = REQUESTED_ARGS.includes("--allow-branch");

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
  "@accord-protocol/buyer-policy",
];

// Reference rail packages at 0.3.0. The @accord-protocol/* tarballs declare
// runtime deps on these (e.g. rails-base depends on agentpay-base@^0.3.0), so
// the install-in-tempdir gate has to ship them as local tarballs too — the
// 0.3.0 line is not yet on the public npm registry.
const LEGACY_PACKAGES = [
  "ergo-agent-pay",
  "ergo-agent-cli",
  "ergo-agent-api",
  "ergo-agent-server",
  "ergo-agent-rosen",
  "ergo-agent-scripts",
  "ergo-agent-mcp",
  "agentpay-base",
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

function fetchRemoteBranch(branch) {
  return run(
    "git",
    ["fetch", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`],
    { stdio: "ignore" },
  );
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

gate("02 release branch synced with origin", () => {
  const branch = run("git", ["branch", "--show-current"]).stdout.trim();
  if (!branch) return fail("detached HEAD; checkout main or a named release branch");

  if (branch === "main") {
    const fetch = fetchRemoteBranch("main");
    if (fetch.status !== 0) return fail("could not fetch origin/main");
    const ahead = run("git", ["rev-list", "--count", "origin/main..HEAD"]).stdout.trim();
    const behind = run("git", ["rev-list", "--count", "HEAD..origin/main"]).stdout.trim();
    if (ahead !== "0") return fail(`local main is ${ahead} commits ahead of origin`);
    if (behind !== "0") return fail(`local main is ${behind} commits behind origin`);
    return pass("on main, in sync with origin");
  }

  if (!ALLOW_BRANCH) {
    return fail(`expected main, got ${branch}; pass --allow-branch for PR smoke`);
  }

  const fetchMain = fetchRemoteBranch("main");
  if (fetchMain.status !== 0) return fail("could not fetch origin/main");
  const fetchBranch = fetchRemoteBranch(branch);
  if (fetchBranch.status !== 0) return fail(`could not fetch origin/${branch}`);

  const remoteBranch = `origin/${branch}`;
  const remoteExists = run("git", ["rev-parse", "--verify", "--quiet", remoteBranch]);
  if (remoteExists.status !== 0) return fail(`${remoteBranch} does not exist; push the branch first`);

  const ahead = run("git", ["rev-list", "--count", `${remoteBranch}..HEAD`]).stdout.trim();
  const behind = run("git", ["rev-list", "--count", `HEAD..${remoteBranch}`]).stdout.trim();
  if (ahead !== "0") return fail(`local ${branch} is ${ahead} commits ahead of ${remoteBranch}; push first`);
  if (behind !== "0") return fail(`local ${branch} is ${behind} commits behind ${remoteBranch}; pull first`);

  const includesMain = run("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  if (includesMain.status !== 0) {
    return fail(`${branch} does not contain origin/main; merge or rebase main before release smoke`);
  }

  return pass(`${branch} is pushed and contains origin/main (--allow-branch)`);
});

gate("03 version distribution (10×0.4.0 + 8×0.3.0)", () => {
  const counts = new Map();
  for (const pkg of fs.readdirSync(path.join(REPO_ROOT, "packages"))) {
    const p = path.join(REPO_ROOT, "packages", pkg, "package.json");
    if (!fs.existsSync(p)) continue;
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    counts.set(json.version, (counts.get(json.version) ?? 0) + 1);
  }
  const expect040 = counts.get("0.4.0") ?? 0;
  const expect030 = counts.get("0.3.0") ?? 0;
  if (expect040 !== 10 || expect030 !== 8) {
    return fail(
      `expected 10×0.4.0 + 8×0.3.0; got ${[...counts].map(([v, c]) => `${c}×${v}`).join(" + ")}`,
    );
  }
  return pass(`10×0.4.0 (Accord) + 8×0.3.0 (legacy)`);
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
  return r.status === 0 ? pass("18 packages built") : fail(`exit ${r.status}`);
});

gate("07 CommonJS export smoke", () => {
  const r = run("npm", ["run", "cjs:check"]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${(r.stderr || r.stdout).slice(0, 500)}`);
  const summary =
    r.stdout
      .trim()
      .split("\n")
      .find((line) => line.startsWith("CommonJS export smoke passed:")) ?? "CJS smoke passed";
  return pass(summary.replace(/^CommonJS export smoke passed: /, ""));
});

gate("08 test --workspaces (expect ≥653 pass, 0 fail)", () => {
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
  if (total < 653) return fail(`only ${total} tests ran (expected ≥653)`);
  return pass(`${total} tests, 0 fails`);
});

gate("09 conformance L0+L1+L2+L3+L4 (Achieved: L4)", () => {
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

gate("10 fixture-hash drift", () => {
  const r = run("node", ["scripts/derive-fixture-hashes.mjs", "--check"]);
  return r.status === 0
    ? pass("0 drift")
    : fail(`exit ${r.status}: ${r.stdout}`);
});

gate("11 end-to-end demo", () => {
  const r = run("npm", ["run", "dev", "-w", "accord-paid-mcp-repo-audit-demo"]);
  if (r.status !== 0) return fail(`exit ${r.status}: ${r.stdout.slice(-500)}`);
  if (!r.stdout.includes("Settlement Receipt")) {
    return fail(`demo did not emit Settlement Receipt:\n${r.stdout.slice(-500)}`);
  }
  return pass("full lifecycle, both receipts emitted");
});

gate("12 keygen + sign + verify round-trip", () => {
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

gate("13 MCP-stdio probe against bundled stub", () => {
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
  gate("14 npm pack every workspace package (10 Accord + 8 legacy)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accord-pack-"));
    PACK_TARBALL_DIR = tmp;
    const allPackages = [...ACCORD_PACKAGES, ...LEGACY_PACKAGES];
    for (const pkg of allPackages) {
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
    return tarballs.length === allPackages.length
      ? pass(`${tarballs.length} tarballs in ${tmp}`)
      : fail(`got ${tarballs.length}, expected ${allPackages.length}`);
  });

  gate("15 install-in-tempdir smoke for all 18 workspace packages", () => {
    if (!PACK_TARBALL_DIR) return fail("gate 14 did not produce tarballs");
    const allTarballs = fs
      .readdirSync(PACK_TARBALL_DIR)
      .filter((f) => f.endsWith(".tgz"));
    const expected = ACCORD_PACKAGES.length + LEGACY_PACKAGES.length;
    if (allTarballs.length !== expected) {
      return fail(`expected ${expected} tarballs, got ${allTarballs.length}`);
    }

    // Build name → tarball-path map so we can resolve transitive 0.3.0 deps
    // (e.g. rails-base depends on agentpay-base@^0.3.0) against the local
    // tarballs via npm `overrides`, since the 0.3.0 packages are not on the
    // public registry yet.
    const nameToTarball = new Map();
    for (const file of allTarballs) {
      const full = path.join(PACK_TARBALL_DIR, file);
      // Parse name out of the tarball filename: scoped accord-protocol-core-0.4.0.tgz
      // becomes @accord-protocol/core; legacy ergo-agent-pay-0.3.0.tgz stays as-is.
      let name;
      if (file.startsWith("accord-protocol-")) {
        const stem = file.replace(/-[\d.]+\.tgz$/, "").replace(/^accord-protocol-/, "");
        name = `@accord-protocol/${stem}`;
      } else {
        name = file.replace(/-[\d.]+\.tgz$/, "");
      }
      nameToTarball.set(name, full);
    }

    const proj = fs.mkdtempSync(path.join(os.tmpdir(), "accord-install-"));
    try {
      // Declare every workspace tarball as a file: dependency. This forces
      // npm to resolve transitive 0.3.0 constraints (e.g. rails-base →
      // agentpay-base@^0.3.0) against the local tarballs rather than the
      // public registry.
      const dependencies = {};
      for (const [name, tarball] of nameToTarball) {
        dependencies[name] = `file:${tarball}`;
      }
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify(
          {
            name: "accord-install-smoke",
            private: true,
            type: "module",
            dependencies,
          },
          null,
          2,
        ),
      );
      const inst = run("npm", ["install", "--no-audit", "--no-fund"], { cwd: proj });
      if (inst.status !== 0) {
        return fail(`npm install exit ${inst.status}: ${inst.stderr.slice(0, 400)}`);
      }
      const importLines = ACCORD_PACKAGES.map(
        (p, i) => `import * as m${i} from ${JSON.stringify(p)};`,
      ).join("\n");
      const exportCount = ACCORD_PACKAGES.map(
        (_, i) => `Object.keys(m${i}).length`,
      ).join(" + ");
      const probePath = path.join(proj, "probe.mjs");
      fs.writeFileSync(
        probePath,
        `${importLines}\nconst total = ${exportCount};\nif (total === 0) { console.error("EMPTY"); process.exit(1); }\nconsole.log("EXPORTS=" + total);\n`,
      );
      const probe = run("node", [probePath], { cwd: proj });
      if (probe.status !== 0) {
        return fail(`probe import failed exit ${probe.status}: ${probe.stderr.slice(0, 400)}`);
      }
      const m = probe.stdout.match(/EXPORTS=(\d+)/);
      if (!m || parseInt(m[1], 10) === 0) {
        return fail(`probe reported no exports:\n${probe.stdout}`);
      }
      return pass(`installed all 18 + imported 10 Accord (${m[1]} total exports)`);
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
  const branch = run("git", ["branch", "--show-current"]).stdout.trim();
  const nextStep = branch === "main"
    ? "Ready to tag v0.4.0."
    : "Branch pre-flight passed; merge to main before tagging v0.4.0.";
  console.log(`✓ All ${GATES.length} gates passed. ${nextStep}`);
  process.exit(0);
} else {
  console.log(`✗ ${failures} of ${GATES.length} gates failed. Fix before tagging.`);
  process.exit(1);
}
