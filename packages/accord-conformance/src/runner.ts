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
import type {
  ConformanceLevel,
  ConformanceLevelResult,
  ConformanceResult,
} from "./types.js";

export interface RunConformanceOptions {
  /** Filesystem path to the repo containing schemas/ + test-vectors/. */
  repoRoot: string;
  /**
   * Levels to run. Defaults to `["L0"]` until PR-018/019 wire up the
   * transport + rail levels.
   */
  levels?: ConformanceLevel[];
  /** Implementation under test. Defaults to "local" — used for the result's `target` field. */
  target?: string;
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
      results.push(await runL1());
    } else if (level === "L2") {
      results.push(await runL2());
    } else {
      results.push({
        level,
        passed: false,
        passed_count: 0,
        failed_count: 0,
        inconclusive_count: 1,
        checks: [
          {
            id: `${level}.not-applicable`,
            level,
            description: `${level} is implementation-side (not measured by this suite at v0)`,
            result: "inconclusive",
            detail:
              level === "L3"
                ? "L3 production-safety gates live in the per-rail packages' tests"
                : "L4 is a registry-side claim; submit to registry/ to claim it",
          },
        ],
      });
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
