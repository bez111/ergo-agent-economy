// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — canonical JSON encoding (`accord-canonical-json/v0`)
//
// Normative spec: docs/canonical-json.md
//
// Rules:
//   * UTF-8, no BOM
//   * keys sorted lex by codepoint at every level
//   * no insignificant whitespace
//   * integers as decimal digits; NO floats anywhere in v0 protocol objects
//   * money amounts arrive as JSON strings (the schema enforces it)
//   * arrays preserve order
//   * top-level extension keys starting with `accord_` are reserved
// ─────────────────────────────────────────────────────────────────────────────

import { AccordError } from "./errors.js";

/** Canonicalize a value to its `accord-canonical-json/v0` byte string. */
export function canonicalize(value: unknown, path = "$"): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new AccordError(
        "v0 protocol objects forbid non-integer numbers; money amounts must be JSON strings",
        "ACCORD_INVALID_AMOUNT",
        path,
      );
    }
    // No leading-zero / no exponent — Number.toString(10) already complies.
    return value.toString(10);
  }

  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map((v, i) => canonicalize(v, `${path}[${i}]`)).join(",") + "]";
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) + ":" + canonicalize(obj[k], `${path}.${k}`),
        )
        .join(",") +
      "}"
    );
  }

  throw new AccordError(
    `Unsupported value type at ${path}: ${typeof value}`,
    "ACCORD_INVALID_SCHEMA",
    path,
  );
}

/** Canonicalize and return UTF-8 bytes — what BLAKE2b-256 hashes over. */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

/**
 * Strip a single top-level field from an object (typically `signature`)
 * before canonicalizing for signing. Returns a shallow copy so the
 * original object is untouched.
 */
export function stripField<T extends Record<string, unknown>>(
  obj: T,
  field: string,
): Omit<T, typeof field> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [field]: _omit, ...rest } = obj;
  return rest as Omit<T, typeof field>;
}
