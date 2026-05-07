// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — error codes
//
// Mirror of the codes called out in ACCORD-001 §9, ACCORD-002 §9, ACCORD-003 §10.
// ─────────────────────────────────────────────────────────────────────────────

export type AccordErrorCode =
  | "ACCORD_INVALID_SCHEMA"
  | "ACCORD_INVALID_AMOUNT"
  | "ACCORD_INVALID_TIMESTAMP"
  | "ACCORD_INVALID_DEADLINE"
  | "ACCORD_INVALID_SIGNATURE"
  | "ACCORD_HASH_MISMATCH"
  | "ACCORD_VERIFIER_MISMATCH"
  | "ACCORD_RESULT_INCONSISTENT"
  | "ACCORD_EVIDENCE_MISSING"
  | "ACCORD_MODE_INVALID_FOR_RAIL"
  | "ACCORD_VERIFICATION_REQUIRED"
  | "ACCORD_AMOUNT_EXCEEDS_AGREEMENT"
  | "ACCORD_TX_FORMAT_INVALID"
  | "ACCORD_RAIL_NOT_CONFIRMED"
  | "ACCORD_UNKNOWN_CRITICAL_EXTENSION";

export class AccordError extends Error {
  readonly code: AccordErrorCode;
  readonly path: string | undefined;

  constructor(message: string, code: AccordErrorCode, path?: string) {
    super(message);
    this.name = "AccordError";
    this.code = code;
    this.path = path;
  }

  toString(): string {
    const where = this.path ? ` at ${this.path}` : "";
    return `AccordError[${this.code}]${where}: ${this.message}`;
  }
}
