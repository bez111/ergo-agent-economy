// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — types
//
// Conformance suite for Accord Protocol implementations. The suite is
// split into levels per ACCORD-009 / TRADEMARK.md:
//
//   L0  Schema-compatible       — objects validate against schemas/v0
//   L1  Transport-compatible    — Accord/402 or Accord/MCP roundtrip works
//   L2  Rail-compatible         — at least one rail adapter passes verifyPayment + settle
//   L3  Security-compatible     — production-safety gates fire on mainnet writes
//   L4  Registry-certified      — listed in the public registry with passing conformance
//
// This package ships L0 + L1 + L2 today (PR-017 covers L0; PR-018/019
// add L1/L2). L3 lives in the per-rail packages' tests; L4 is a
// registry-side claim.
// ─────────────────────────────────────────────────────────────────────────────

export type ConformanceLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface ConformanceCheck {
  /** Stable identifier — `L0.schema.agreement.minimal-valid`, etc. */
  id: string;
  /** Level this check belongs to. */
  level: ConformanceLevel;
  /** Human-readable description. */
  description: string;
  /** Result. `inconclusive` means the check could not run (e.g. dependency unmet). */
  result: "pass" | "fail" | "inconclusive";
  /** When result != pass: human-readable reason. */
  detail?: string;
  /** Optional ms duration the check took to run. */
  duration_ms?: number;
}

export interface ConformanceLevelResult {
  level: ConformanceLevel;
  /** True iff every check at this level passed (no fails, no inconclusives). */
  passed: boolean;
  passed_count: number;
  failed_count: number;
  inconclusive_count: number;
  checks: ConformanceCheck[];
}

export interface ConformanceResult {
  /** Implementation under test — usually a URL or a package name. */
  target: string;
  /** Wall-clock UTC at the start of the run. */
  started_at: string;
  /** Wall-clock UTC when the run finished. */
  finished_at: string;
  /** Per-level results in L-order. */
  levels: ConformanceLevelResult[];
  /** The highest level that fully passed (used for badge claims). */
  achieved_level: ConformanceLevel | null;
}
