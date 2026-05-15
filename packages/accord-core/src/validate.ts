// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — semantic validation of Accord protocol objects
//
// The JSON schemas in `schemas/` already enforce structural shape via ajv.
// This module enforces the cross-field rules called out in
// ACCORD-001 §7, ACCORD-002 §6, ACCORD-003 §7 — the things a JSON-Schema
// can't easily express:
//
//   * Agreement.payment.deadline parses as one of three accepted forms
//   * Agreement.created_at is ISO-8601 UTC with `Z`
//   * Verification Receipt: result==accepted requires no failed checks
//   * Verification Receipt: evidence_required (Agreement) ⊆ checks (Receipt)
//   * Verification Receipt: agreement_id/hash match the parent Agreement
//     when one is supplied
//   * Settlement Receipt: agreement_id/hash, rail, currency, and decimals
//     match the parent Agreement when one is supplied
//   * Settlement Receipt: mode is in the per-rail allow-list
//   * Settlement Receipt: status==settled requires verification_receipts when
//     the parent Agreement set verification.required=true
//   * Settlement Receipt: amount ≤ Agreement.price.amount
//   * Reserved namespace: top-level keys MUST NOT start with `accord_`
//     (other than the `type`/`version` markers)
// ─────────────────────────────────────────────────────────────────────────────

import type { AccordErrorCode } from "./errors.js";
import { accordHashV0 } from "./hash.js";
import {
  RAIL_MODE_ALLOWLIST,
  type AccordAgreement,
  type AccordSettlementReceipt,
  type AccordVerificationReceipt,
} from "./types.js";

const ISO_UTC = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const DEADLINE_RELATIVE = /^\+[0-9]+ (blocks|seconds)$/;
const DECIMAL_AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const ACCORD_HASH_V0 = /^blake2b256:0x[0-9a-f]{64}$/;
const HASH_PREFIXED = /^(blake2b256|keccak256|sha256):0x[0-9a-f]{64}$/;

export interface ValidationProblem {
  code: AccordErrorCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  problems: ValidationProblem[];
}

function rejectReservedTopLevelNamespace(
  value: Record<string, unknown>,
  problems: ValidationProblem[],
) {
  for (const key of Object.keys(value)) {
    if (key.startsWith("accord_")) {
      problems.push({
        code: "ACCORD_UNKNOWN_CRITICAL_EXTENSION",
        path: `$.${key}`,
        message: "top-level field uses the reserved 'accord_' prefix",
      });
    }
  }
}

function expectedAgreementHash(agreement: AccordAgreement): string {
  return `blake2b256:0x${accordHashV0(agreement)}`;
}

function validateReceiptAgreementBinding(
  receipt: { agreement_id: string; agreement_hash: string },
  agreement: AccordAgreement,
  problems: ValidationProblem[],
): void {
  if (receipt.agreement_id !== agreement.agreement_id) {
    problems.push({
      code: "ACCORD_AGREEMENT_MISMATCH",
      path: "$.agreement_id",
      message: "receipt agreement_id does not match the resolved Agreement",
    });
  }

  const expectedHash = expectedAgreementHash(agreement);
  if (receipt.agreement_hash !== expectedHash) {
    problems.push({
      code: "ACCORD_HASH_MISMATCH",
      path: "$.agreement_hash",
      message: "receipt agreement_hash does not match the resolved Agreement hash",
    });
  }
}

// ── Agreement ───────────────────────────────────────────────────────────────

export function validateAgreement(agreement: AccordAgreement): ValidationResult {
  const problems: ValidationProblem[] = [];

  rejectReservedTopLevelNamespace(
    agreement as unknown as Record<string, unknown>,
    problems,
  );

  if (!ISO_UTC.test(agreement.created_at)) {
    problems.push({
      code: "ACCORD_INVALID_TIMESTAMP",
      path: "$.created_at",
      message: "expected ISO-8601 UTC, second precision (YYYY-MM-DDTHH:MM:SSZ)",
    });
  }

  if (!DECIMAL_AMOUNT.test(agreement.price.amount)) {
    problems.push({
      code: "ACCORD_INVALID_AMOUNT",
      path: "$.price.amount",
      message: "expected a decimal string with no leading zeros",
    });
  }

  const dl = agreement.payment.deadline;
  if (!DEADLINE_RELATIVE.test(dl) && !ISO_UTC.test(dl)) {
    problems.push({
      code: "ACCORD_INVALID_DEADLINE",
      path: "$.payment.deadline",
      message: "expected '+N blocks', '+N seconds', or absolute ISO-8601 UTC",
    });
  }

  if (agreement.payment.mode === "note" && !agreement.payment.reserve_ref) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.payment.reserve_ref",
      message: "payment.mode=note requires payment.reserve_ref",
    });
  }

  if (agreement.verification.method === "verifier_receipt" && !agreement.verification.verifier) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.verification.verifier",
      message: "verification.method=verifier_receipt requires verification.verifier",
    });
  }
  if (agreement.verification.method === "onchain_predicate" && !agreement.verification.predicate) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.verification.predicate",
      message: "verification.method=onchain_predicate requires verification.predicate",
    });
  }

  return { ok: problems.length === 0, problems };
}

// ── Verification Receipt ────────────────────────────────────────────────────

export function validateVerificationReceipt(
  receipt: AccordVerificationReceipt,
  context?: { agreement?: AccordAgreement },
): ValidationResult {
  const problems: ValidationProblem[] = [];

  rejectReservedTopLevelNamespace(
    receipt as unknown as Record<string, unknown>,
    problems,
  );

  if (!ISO_UTC.test(receipt.created_at)) {
    problems.push({
      code: "ACCORD_INVALID_TIMESTAMP",
      path: "$.created_at",
      message: "expected ISO-8601 UTC, second precision",
    });
  }

  if (!ACCORD_HASH_V0.test(receipt.agreement_hash)) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.agreement_hash",
      message: "expected 'blake2b256:0x<64 hex>'",
    });
  }

  if (!HASH_PREFIXED.test(receipt.evidence.output_hash)) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.evidence.output_hash",
      message: "expected '<algo>:0x<64 hex>' with algo in blake2b256/keccak256/sha256",
    });
  }

  // result=accepted ⇒ no failed check
  if (receipt.result === "accepted" && receipt.checks?.some((c) => c.result === "fail")) {
    problems.push({
      code: "ACCORD_RESULT_INCONSISTENT",
      path: "$.result",
      message: "result=accepted while at least one check has result=fail",
    });
  }
  // result=rejected ⇒ at least one failed check OR a `detail` somewhere
  if (
    receipt.result === "rejected" &&
    !(receipt.checks?.some((c) => c.result === "fail" || c.detail))
  ) {
    problems.push({
      code: "ACCORD_RESULT_INCONSISTENT",
      path: "$.result",
      message: "result=rejected requires at least one failed check or a detail",
    });
  }

  if (context?.agreement) {
    const ag = context.agreement;

    validateReceiptAgreementBinding(receipt, ag, problems);

    if (ag.verification.verifier && ag.verification.verifier !== receipt.verifier.id) {
      problems.push({
        code: "ACCORD_VERIFIER_MISMATCH",
        path: "$.verifier.id",
        message: `verifier ${receipt.verifier.id} does not match agreement.verification.verifier ${ag.verification.verifier}`,
      });
    }

    const required = ag.verification.evidence_required ?? [];
    if (required.length > 0) {
      const checkNames = new Set(
        (receipt.checks ?? [])
          .filter((c) => c.result !== "skip")
          .map((c) => c.name),
      );
      for (const name of required) {
        if (!checkNames.has(name)) {
          problems.push({
            code: "ACCORD_EVIDENCE_MISSING",
            path: `$.checks`,
            message: `required evidence '${name}' is missing or marked skip`,
          });
        }
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

// ── Settlement Receipt ──────────────────────────────────────────────────────

export function validateSettlementReceipt(
  receipt: AccordSettlementReceipt,
  context?: { agreement?: AccordAgreement },
): ValidationResult {
  const problems: ValidationProblem[] = [];

  rejectReservedTopLevelNamespace(
    receipt as unknown as Record<string, unknown>,
    problems,
  );

  if (!ISO_UTC.test(receipt.created_at)) {
    problems.push({
      code: "ACCORD_INVALID_TIMESTAMP",
      path: "$.created_at",
      message: "expected ISO-8601 UTC, second precision",
    });
  }

  if (!DECIMAL_AMOUNT.test(receipt.amount)) {
    problems.push({
      code: "ACCORD_INVALID_AMOUNT",
      path: "$.amount",
      message: "expected a decimal string with no leading zeros",
    });
  }

  if (!ACCORD_HASH_V0.test(receipt.agreement_hash)) {
    problems.push({
      code: "ACCORD_INVALID_SCHEMA",
      path: "$.agreement_hash",
      message: "expected 'blake2b256:0x<64 hex>'",
    });
  }

  // Per-rail mode allow-list. The JSON schema already enforces this, but
  // re-checking here means consumers that bypass schema validation still
  // get a typed error.
  const allowed = RAIL_MODE_ALLOWLIST[receipt.rail];
  if (!allowed.includes(receipt.mode)) {
    problems.push({
      code: "ACCORD_MODE_INVALID_FOR_RAIL",
      path: "$.mode",
      message: `mode '${receipt.mode}' is not in the allow-list for rail '${receipt.rail}'`,
    });
  }

  if ((receipt.rail === "ergo" || receipt.rail === "rosen") && !receipt.tx.box_id) {
    problems.push({
      code: "ACCORD_TX_FORMAT_INVALID",
      path: "$.tx.box_id",
      message: `rail '${receipt.rail}' requires tx.box_id`,
    });
  }

  if (context?.agreement) {
    const ag = context.agreement;

    validateReceiptAgreementBinding(receipt, ag, problems);

    if (receipt.rail !== ag.payment.rail) {
      problems.push({
        code: "ACCORD_RAIL_MISMATCH",
        path: "$.rail",
        message: "settlement rail does not match agreement.payment.rail",
      });
    }

    if (
      receipt.currency !== ag.price.currency ||
      receipt.decimals !== ag.price.decimals
    ) {
      problems.push({
        code: "ACCORD_CURRENCY_MISMATCH",
        path: "$.currency",
        message: "settlement currency/decimals do not match agreement.price",
      });
    }

    if (
      ag.verification.required &&
      receipt.status === "settled" &&
      (!receipt.verification_receipts || receipt.verification_receipts.length === 0)
    ) {
      problems.push({
        code: "ACCORD_VERIFICATION_REQUIRED",
        path: "$.verification_receipts",
        message:
          "agreement.verification.required=true and status=settled requires at least one verification_receipts entry",
      });
    }

    if (
      DECIMAL_AMOUNT.test(receipt.amount) &&
      DECIMAL_AMOUNT.test(ag.price.amount) &&
      compareDecimal(receipt.amount, ag.price.amount) > 0
    ) {
      problems.push({
        code: "ACCORD_AMOUNT_EXCEEDS_AGREEMENT",
        path: "$.amount",
        message: `settlement amount ${receipt.amount} exceeds agreement price ${ag.price.amount}`,
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Compare two decimal-string amounts. Returns -1 / 0 / 1.
 *
 * Both inputs are assumed to match `DECIMAL_AMOUNT`. Fractional comparison
 * is done by aligning the right-hand digits with zero-padding, so this works
 * across `decimals` mismatches when both strings already share the same
 * unit-of-account (which the schema enforces — currency must match between
 * Agreement and Settlement Receipt).
 */
export function compareDecimal(a: string, b: string): number {
  const [aInt, aFrac = ""] = a.split(".");
  const [bInt, bFrac = ""] = b.split(".");

  // Normalize integer side by left-padding to equal length.
  const aI = aInt ?? "0";
  const bI = bInt ?? "0";
  const intLen = Math.max(aI.length, bI.length);
  const aIp = aI.padStart(intLen, "0");
  const bIp = bI.padStart(intLen, "0");
  if (aIp !== bIp) return aIp < bIp ? -1 : 1;

  // Then fractional side, right-padded.
  const fracLen = Math.max(aFrac.length, bFrac.length);
  const aFp = aFrac.padEnd(fracLen, "0");
  const bFp = bFrac.padEnd(fracLen, "0");
  if (aFp === bFp) return 0;
  return aFp < bFp ? -1 : 1;
}
