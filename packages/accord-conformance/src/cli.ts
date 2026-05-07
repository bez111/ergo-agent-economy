#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// accord-conformance CLI
//
// Usage:
//   npx accord-conformance                                   # run L0 against the local repo
//   npx accord-conformance --levels L0                        # explicit
//   npx accord-conformance --levels L0,L1,L2                  # request more levels (some may be inconclusive)
//   npx accord-conformance --repo-root /path/to/accord-protocol --json
//
// Exit codes:
//   0  every requested level passed
//   1  at least one fail or inconclusive at the requested levels
//   2  CLI usage error
// ─────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { runConformance } from "./runner.js";
import type { ConformanceLevel, ConformanceResult } from "./types.js";

function parseArgs(argv: string[]): {
  repoRoot: string;
  levels: ConformanceLevel[];
  json: boolean;
} {
  const out = {
    repoRoot: process.cwd(),
    levels: ["L0"] as ConformanceLevel[],
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo-root") {
      const v = argv[++i];
      if (!v) usageExit(`--repo-root requires a value`);
      out.repoRoot = path.resolve(v);
    } else if (a === "--levels") {
      const v = argv[++i];
      if (!v) usageExit(`--levels requires a comma-separated value (e.g. L0,L1)`);
      out.levels = v.split(",").map((s) => s.trim()).filter(Boolean) as ConformanceLevel[];
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else {
      usageExit(`unknown flag: ${a}`);
    }
  }
  return out;
}

function usageExit(reason: string): never {
  process.stderr.write(`accord-conformance: ${reason}\n\n`);
  printUsage();
  process.exit(2);
}

function printUsage(): void {
  process.stderr.write(
    [
      `Usage: accord-conformance [--repo-root <dir>] [--levels L0,L1,L2] [--json]`,
      ``,
      `Run the Accord Protocol conformance suite. Defaults to L0 against the`,
      `current working directory.`,
      ``,
      `  --repo-root <dir>   Repo containing schemas/ + test-vectors/ (default: cwd)`,
      `  --levels  L0,L1,L2  Levels to run (default: L0)`,
      `  --json              Emit JSON; useful for CI / submitting to the registry`,
      `  --help, -h          Print this and exit`,
      ``,
      `Exit codes: 0 (all requested levels pass), 1 (any fail/inconclusive), 2 (usage error).`,
      ``,
    ].join("\n"),
  );
}

function emitText(result: ConformanceResult): void {
  console.log(`Accord Conformance — ${result.target}`);
  console.log(`  ${result.started_at} → ${result.finished_at}`);
  console.log("");
  for (const lvl of result.levels) {
    const total = lvl.passed_count + lvl.failed_count + lvl.inconclusive_count;
    const status = lvl.passed
      ? "PASS"
      : lvl.failed_count > 0
        ? "FAIL"
        : "INCONCLUSIVE";
    console.log(
      `  ${lvl.level} ${status}  (${lvl.passed_count}/${total} pass, ${lvl.failed_count} fail, ${lvl.inconclusive_count} inconclusive)`,
    );
    for (const c of lvl.checks) {
      if (c.result === "pass") continue;
      console.log(`    ${c.result.toUpperCase().padEnd(13)} ${c.id}`);
      if (c.detail) {
        const lines = c.detail.split("\n");
        for (const line of lines) console.log(`                  ${line}`);
      }
    }
  }
  console.log("");
  console.log(
    `Achieved: ${result.achieved_level ?? "(none — fix L0 fails before claiming any badge)"}`,
  );
}

(async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runConformance({
    repoRoot: args.repoRoot,
    levels: args.levels,
    target: `local:${path.basename(args.repoRoot)}`,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    emitText(result);
  }
  const allPassed = result.levels.every((l) => l.passed);
  process.exit(allPassed ? 0 : 1);
})().catch((err: unknown) => {
  process.stderr.write(`accord-conformance crashed: ${(err as Error)?.message ?? String(err)}\n`);
  process.exit(1);
});
