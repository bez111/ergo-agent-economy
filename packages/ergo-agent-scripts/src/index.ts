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

export {
  loadAuditedManifest,
  getAuditedEntry,
  verifyAuditedErgoTree,
  verifyManifestAgainstRegistry,
} from "./audited.js";

export type {
  AuditedEntry,
  AuditedManifest,
  AuditVerdict,
} from "./audited.js";

export type {
  PredicateName,
  PredicateEntry,
  PredicateRegistry,
} from "./types.js";
