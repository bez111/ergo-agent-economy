// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/mcp — error code registry
//
// MCP-side codes layered on top of @accord-protocol/core's AccordErrorCode.
// Any code surfaced via _meta.accord_error_code in an MCP error result
// is one of these.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCORD_MCP_ERROR_CODES = {
  // --- Schema-shape errors raised before we even look at the rail
  MISSING_AGREEMENT_ID: "MISSING_AGREEMENT_ID",
  UNKNOWN_AGREEMENT: "UNKNOWN_AGREEMENT",
  MISSING_PAYMENT: "MISSING_PAYMENT",
  AGREEMENT_INVALID: "AGREEMENT_INVALID",

  // --- Rail-side payment errors
  PAYMENT_VERIFICATION_FAILED: "PAYMENT_VERIFICATION_FAILED",
  RAIL_UNAVAILABLE: "RAIL_UNAVAILABLE",

  // --- Output / verification errors
  TASK_OUTPUT_HASH_MISMATCH: "TASK_OUTPUT_HASH_MISMATCH",
  VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
  VERIFICATION_REJECTED: "VERIFICATION_REJECTED",

  // --- Tool-side errors
  HANDLER_THREW: "HANDLER_THREW",
} as const;

export type AccordMcpErrorCode =
  (typeof ACCORD_MCP_ERROR_CODES)[keyof typeof ACCORD_MCP_ERROR_CODES];
