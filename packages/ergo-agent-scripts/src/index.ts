// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-scripts — public surface
// ─────────────────────────────────────────────────────────────────────────────

export {
  loadRegistry,
  getPredicate,
  tryGetErgoTree,
  hashErgoTree,
  verifyErgoTree,
} from "./registry.js";

export type {
  PredicateName,
  PredicateEntry,
  PredicateRegistry,
} from "./types.js";
