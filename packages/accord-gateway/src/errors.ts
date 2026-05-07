// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/gateway — error codes
//
// What the gateway puts into the JSON envelope of a 4xx response. Mirrors
// the accord-mcp error registry but with codes that make sense in HTTP land
// (the wrapper-vs-handler distinction matters less here).
// ─────────────────────────────────────────────────────────────────────────────

export const ACCORD_GATEWAY_ERROR_CODES = {
  /** Buyer didn't include any Accord headers — gateway returns 402 with a template. */
  ACCORD_PAYMENT_REQUIRED: "ACCORD_PAYMENT_REQUIRED",

  /** Buyer included an agreement-id but it doesn't resolve. */
  UNKNOWN_AGREEMENT: "UNKNOWN_AGREEMENT",

  /** Buyer included partial Accord headers (e.g. id without payment). */
  MISSING_PAYMENT: "MISSING_PAYMENT",

  /** validateAgreement rejected the resolved Agreement. */
  AGREEMENT_INVALID: "AGREEMENT_INVALID",

  /** Rail's verifyPayment returned ok:false. */
  PAYMENT_VERIFICATION_FAILED: "PAYMENT_VERIFICATION_FAILED",

  /** Rail's verifyPayment threw. */
  RAIL_UNAVAILABLE: "RAIL_UNAVAILABLE",

  /** payment_id was already claimed within the TTL. */
  REPLAY_DETECTED: "REPLAY_DETECTED",

  /** Pre-committed task-output hash mismatch. */
  TASK_OUTPUT_HASH_MISMATCH: "TASK_OUTPUT_HASH_MISMATCH",

  /** Seller's handler threw. */
  HANDLER_THREW: "HANDLER_THREW",

  /** Verification was required but no verifier configured / verifier rejected. */
  VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
  VERIFICATION_REJECTED: "VERIFICATION_REJECTED",
} as const;

export type AccordGatewayErrorCode =
  (typeof ACCORD_GATEWAY_ERROR_CODES)[keyof typeof ACCORD_GATEWAY_ERROR_CODES];
