// Same helper as rails-ergo / rails-base — kept local so this package
// doesn't depend on a sibling rail.

import { AccordError } from "@accord-protocol/core";

const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

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
  let fracPart = fracPartRaw;
  if (fracPart.length > decimals) {
    throw new AccordError(
      `amount ${amount} has more fractional digits (${fracPart.length}) than ${decimals} decimals; quantise first`,
      "ACCORD_INVALID_AMOUNT",
      "$.amount",
    );
  }
  fracPart = fracPart.padEnd(decimals, "0");
  const combined = (intPart ?? "0") + fracPart;
  return BigInt(combined === "" ? "0" : combined);
}
