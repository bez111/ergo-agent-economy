// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — top-level runner
//
// Orchestrates the per-level checks and assembles a ConformanceResult.
// L0 ships in PR-017; L1/L2 wire up in PR-018/019.
// ─────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { runL0 } from "./l0-schema.js";
import { runL1 } from "./l1-transport.js";
import { runL2 } from "./l2-rail.js";
import { runL3 } from "./l3-security.js";
import { runL4 } from "./l4-registry.js";
import { runL1Network } from "./l1-network.js";
import { runL1McpStdio } from "./l1-mcp-stdio.js";
import type {
  ConformanceLevel,
  ConformanceLevelResult,
  ConformanceResult,
} from "./types.js";

export interface RunConformanceOptions {
  /** Filesystem path to the repo containing schemas/ + test-vectors/. */
  repoRoot: string;
  /**
   * Levels to run. Defaults to `["L0"]`.
   */
  levels?: ConformanceLevel[];
  /** Implementation under test. Defaults to "local" — used for the result's `target` field. */
  target?: string;
  /**
   * Live HTTP endpoint to probe instead of running L1 in-process. When
   * supplied, `runL1` is replaced with `runL1Network({ url })`. The other
   * levels still run against `repoRoot` because they're filesystem-side.
   */
  targetUrl?: string;
  /**
   * Live MCP-stdio command to probe. Mutually exclusive with `targetUrl`.
   * E.g. `./node_modules/.bin/my-mcp-server` or `node ./build/server.js`.
   */
  targetStdio?: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string };
  /** Optional buyer-supplied agreement_id for the network L1 happy-path probe. */
  agreementId?: string;
  /** Optional buyer-supplied payment payload (rail-specific) for the happy-path probe. */
  paymentJson?: string;
}

export async function runConformance(
  opts: RunConformanceOptions,
): Promise<ConformanceResult> {
  const startedAt = nowIsoUtc();
  const levels = opts.levels ?? ["L0"];
  const target = opts.target ?? `local:${path.basename(opts.repoRoot)}`;

  const results: ConformanceLevelResult[] = [];
  for (const level of levels) {
    if (level === "L0") {
      results.push(await runL0({ repoRoot: opts.repoRoot }));
    } else if (level === "L1") {
      if (opts.targetStdio) {
        results.push(await runL1McpStdio(opts.targetStdio));
      } else if (opts.targetUrl) {
        results.push(
          await runL1Network({
            url: opts.targetUrl,
            agreementId: opts.agreementId,
            paymentJson: opts.paymentJson,
          }),
        );
      } else {
        results.push(await runL1());
      }
    } else if (level === "L2") {
      results.push(await runL2());
    } else if (level === "L3") {
      results.push(await runL3());
    } else if (level === "L4") {
      results.push(await runL4({ repoRoot: opts.repoRoot }));
    }
  }

  const finishedAt = nowIsoUtc();
  return {
    target,
    started_at: startedAt,
    finished_at: finishedAt,
    levels: results,
    achieved_level: highestPassedLevel(results),
  };
}

/** Return the highest level that fully passed; null if none. */
function highestPassedLevel(
  results: ConformanceLevelResult[],
): ConformanceLevel | null {
  // Levels are ordered L0 < L1 < L2 < L3 < L4. We require monotonic
  // pass — you can't claim L1 without L0.
  const order: ConformanceLevel[] = ["L0", "L1", "L2", "L3", "L4"];
  let last: ConformanceLevel | null = null;
  for (const lvl of order) {
    const r = results.find((x) => x.level === lvl);
    if (!r) break;
    if (!r.passed) break;
    last = lvl;
  }
  return last;
}

function nowIsoUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
