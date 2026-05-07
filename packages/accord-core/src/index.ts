// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — public API
//
// `accord_hash_v0 = BLAKE2b-256( canonicalize_bytes(object) )`
//
// Three families of functions:
//   * canonicalize / canonicalizeBytes / stripField
//   * accordHashV0 / accordHashV0Raw / signingHash / signingHashRaw / withPrefix / stripPrefix
//   * validateAgreement / validateVerificationReceipt / validateSettlementReceipt
//
// Plus types and the per-rail mode allow-list. No rail-specific imports.
// ─────────────────────────────────────────────────────────────────────────────

export {
  canonicalize,
  canonicalizeBytes,
  stripField,
} from "./canonicalize.js";

export {
  accordHashV0,
  accordHashV0Raw,
  signingHash,
  signingHashRaw,
  withPrefix,
  stripPrefix,
} from "./hash.js";

export {
  validateAgreement,
  validateVerificationReceipt,
  validateSettlementReceipt,
  compareDecimal,
  type ValidationProblem,
  type ValidationResult,
} from "./validate.js";

export { AccordError, type AccordErrorCode } from "./errors.js";

export {
  RAIL_MODE_ALLOWLIST,
  type AccordAgreement,
  type AccordVerificationReceipt,
  type AccordSettlementReceipt,
  type AccordCurrency,
  type AccordRail,
  type AccordParty,
  type AccordTask,
  type AccordPrice,
  type AccordPayment,
  type AccordPaymentMode,
  type AccordVerification,
  type AccordVerificationMethod,
  type AccordVerificationResult,
  type AccordCheck,
  type AccordCheckResult,
  type AccordEvidence,
  type AccordSettlementTerms,
  type AccordSettlementMode,
  type AccordSettlementMode2,
  type AccordSettlementStatus,
  type AccordRefundPolicy,
  type AccordDisputePolicy,
  type AccordSignature,
  type AccordSignatureScheme,
  type AccordSettlementSignature,
  type AccordPartySignature,
  type AccordTx,
} from "./types.js";
