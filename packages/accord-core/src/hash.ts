// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — `accord_hash_v0`
//
// `accord_hash_v0 = BLAKE2b-256( canonicalize_bytes(object) )`
//
// Hex output is lower-case, no `0x` prefix. The cross-doc convention for
// agreement_hash / verification_receipt_hash / settlement_receipt_hash
// strings inside protocol objects is `blake2b256:0x<64 hex>`; helpers
// `withPrefix` / `stripPrefix` translate between the wire form and the
// raw 32-byte digest.
// ─────────────────────────────────────────────────────────────────────────────

import { blake2b } from "@noble/hashes/blake2";
import { canonicalizeBytes, stripField } from "./canonicalize.js";
import { AccordError } from "./errors.js";

/** Raw 32-byte BLAKE2b-256 of the canonical JSON bytes. */
export function accordHashV0Raw(value: unknown): Uint8Array {
  return blake2b(canonicalizeBytes(value), { dkLen: 32 });
}

/** Hex (lower-case, no `0x` prefix) of `accord_hash_v0`. */
export function accordHashV0(value: unknown): string {
  return toHex(accordHashV0Raw(value));
}

/**
 * Wire form used inside protocol objects: `blake2b256:0x<64 hex>`.
 *
 * Used by `agreement_hash`, `verification_receipts[i]`, and any other field
 * that carries an `accord_hash_v0` reference.
 */
export function withPrefix(hashHex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) {
    throw new AccordError(
      "expected 64 lower-case hex chars (raw blake2b256 digest)",
      "ACCORD_INVALID_SCHEMA",
    );
  }
  return `blake2b256:0x${hashHex}`;
}

/** Strip the `blake2b256:0x` wire prefix and return the 64-hex digest. */
export function stripPrefix(prefixed: string): string {
  const m = /^blake2b256:0x([0-9a-f]{64})$/.exec(prefixed);
  if (!m) {
    throw new AccordError(
      "expected the wire form `blake2b256:0x<64 hex>`",
      "ACCORD_INVALID_SCHEMA",
    );
  }
  return m[1] as string;
}

/**
 * Hash for the *signing input* of a receipt. Strips the named field (almost
 * always `"signature"`) before canonicalizing — that's the input bytes the
 * signer commits to.
 *
 * Returns the raw 32-byte digest because verifier libraries usually want
 * bytes, not hex.
 */
export function signingHashRaw(
  receipt: Record<string, unknown>,
  fieldToStrip = "signature",
): Uint8Array {
  return accordHashV0Raw(stripField(receipt, fieldToStrip));
}

/** Hex form of `signingHashRaw`. */
export function signingHash(
  receipt: Record<string, unknown>,
  fieldToStrip = "signature",
): string {
  return toHex(signingHashRaw(receipt, fieldToStrip));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
