// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-ergo — units helpers
//
// Convert decimal-string amounts (Accord's wire form) to / from the bigint
// base units (nanoERG) the chain works in. The decimal string is what the
// JSON Schema enforces; the rail-side comparisons need integers.
//
// Examples:
//   decimalToBaseUnits("25", 9)    → 25_000_000_000n   (25 ERG → nanoERG)
//   decimalToBaseUnits("0.001", 9) → 1_000_000n        (0.001 ERG → nanoERG)
//   decimalToBaseUnits("1.5", 6)   → 1_500_000n        (1.5 USDC → 6-dec base units)
// ─────────────────────────────────────────────────────────────────────────────

import { AccordError } from "@accord-protocol/core";

const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/** Convert a decimal string with N decimals to the chain's bigint base units. */
export function decimalToBaseUnits(amount: string, decimals: number): bigint {
  if (!DECIMAL_PATTERN.test(amount)) {
    throw new AccordError(
      `expected a decimal string matching ${DECIMAL_PATTERN}; got ${JSON.stringify(amount)}`,
      "ACCORD_INVALID_AMOUNT",
      "$.amount",
    );
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 24) {
    throw new AccordError(
      `decimals must be an integer in [0, 24]; got ${decimals}`,
      "ACCORD_INVALID_AMOUNT",
      "$.decimals",
    );
  }

  const [intPart, fracPartRaw = ""] = amount.split(".");
  // Right-pad / truncate the fractional part to exactly `decimals` digits.
  let fracPart = fracPartRaw;
  if (fracPart.length > decimals) {
    // Reject silent truncation — caller must pre-quantise to the rail's
    // resolution. e.g. "0.0000000001" with decimals=9 has more precision
    // than nanoERG can express; we throw so the agreement and the chain
    // never disagree.
    throw new AccordError(
      `amount ${amount} has more fractional digits (${fracPart.length}) than the rail's ${decimals} decimals; quantise first`,
      "ACCORD_INVALID_AMOUNT",
      "$.amount",
    );
  }
  fracPart = fracPart.padEnd(decimals, "0");
  const combined = (intPart ?? "0") + fracPart;
  return BigInt(combined === "" ? "0" : combined);
}
