// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — signing infrastructure
//
// ed25519 signatures over canonical-JSON-with-signature-stripped, same
// pattern as ACCORD-002 §5 receipts. Two artifact types use this:
//
//   1. ConformanceResult        — provider runs the suite, signs the JSON,
//                                  submits to registry. Verifiers check the
//                                  signature against the provider's pinned key.
//   2. AuditedManifest          — external auditor reviews the source +
//                                  trees, signs the manifest's `auditor`
//                                  field (NOT mainnetAllowed flips — those
//                                  remain a deliberate, reviewed decision).
//
// The signing input is BLAKE2b-256 of the canonicalized object with the
// `signature` field stripped. Same algorithm as core's `signingHashRaw`,
// reused so a third-party language SDK can produce byte-identical inputs.
// ─────────────────────────────────────────────────────────────────────────────

import { ed25519 } from "@noble/curves/ed25519";
import { canonicalize } from "@accord-protocol/core";
import { blake2b } from "@noble/hashes/blake2";

export interface AccordSignature {
  scheme: "ed25519";
  /** Hex-encoded public key, with `0x` prefix. */
  public_key: `0x${string}`;
  /** Hex-encoded signature, with `0x` prefix. */
  signature: `0x${string}`;
  /** Optional issuer label — useful when the registry maps keys to identities. */
  signer?: string;
  /** ISO-8601 UTC timestamp the signature was produced at. */
  signed_at: string;
}

/** Generate a fresh ed25519 keypair. Both fields are hex with `0x` prefix. */
export function generateEd25519Keypair(): {
  privateKey: `0x${string}`;
  publicKey: `0x${string}`;
} {
  const sk = ed25519.utils.randomPrivateKey();
  const pk = ed25519.getPublicKey(sk);
  return {
    privateKey: ("0x" + bytesToHex(sk)) as `0x${string}`,
    publicKey: ("0x" + bytesToHex(pk)) as `0x${string}`,
  };
}

/**
 * Sign any JSON-serialisable object. The `signature` field (if present) is
 * stripped before canonicalising, then BLAKE2b-256-hashed, then signed.
 *
 * Returns a new object with `signature` set. The original is left untouched.
 */
export function signObject<T extends Record<string, unknown>>(
  obj: T,
  args: {
    privateKey: `0x${string}`;
    publicKey?: `0x${string}`;
    signer?: string;
  },
): T & { signature: AccordSignature } {
  const sk = hexToBytes(args.privateKey);
  const pk = args.publicKey ? hexToBytes(args.publicKey) : ed25519.getPublicKey(sk);
  const stripped = stripSignature(obj);
  const digest = blake2b(new TextEncoder().encode(canonicalize(stripped)), { dkLen: 32 });
  const sig = ed25519.sign(digest, sk);
  const signature: AccordSignature = {
    scheme: "ed25519",
    public_key: ("0x" + bytesToHex(pk)) as `0x${string}`,
    signature: ("0x" + bytesToHex(sig)) as `0x${string}`,
    signed_at: nowIsoUtc(),
    ...(args.signer ? { signer: args.signer } : {}),
  };
  return { ...obj, signature } as T & { signature: AccordSignature };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; code: VerifyErrorCode; message: string };

export type VerifyErrorCode =
  | "MISSING_SIGNATURE"
  | "MALFORMED_SIGNATURE"
  | "UNSUPPORTED_SCHEME"
  | "PUBLIC_KEY_MISMATCH"
  | "BAD_SIGNATURE";

/**
 * Verify a signed object. The `signature` field is stripped before
 * canonicalising; the remaining bytes are hashed and the signature is
 * verified against the embedded public key.
 *
 * If `expectedPublicKey` is provided, the embedded public key MUST match
 * (defends against an attacker rotating the key in a forged signature).
 */
export function verifySignature(
  obj: Record<string, unknown>,
  expectedPublicKey?: `0x${string}`,
): VerifyResult {
  const sig = obj.signature as AccordSignature | undefined;
  if (!sig || typeof sig !== "object") {
    return { ok: false, code: "MISSING_SIGNATURE", message: "no signature field" };
  }
  if (sig.scheme !== "ed25519") {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEME",
      message: `expected ed25519, got ${sig.scheme}`,
    };
  }
  if (
    typeof sig.public_key !== "string" ||
    !/^0x[0-9a-f]+$/i.test(sig.public_key) ||
    typeof sig.signature !== "string" ||
    !/^0x[0-9a-f]+$/i.test(sig.signature)
  ) {
    return {
      ok: false,
      code: "MALFORMED_SIGNATURE",
      message: "public_key / signature must be 0x-prefixed hex",
    };
  }
  if (
    expectedPublicKey &&
    sig.public_key.toLowerCase() !== expectedPublicKey.toLowerCase()
  ) {
    return {
      ok: false,
      code: "PUBLIC_KEY_MISMATCH",
      message: `embedded ${sig.public_key} ≠ expected ${expectedPublicKey}`,
    };
  }

  const stripped = stripSignature(obj);
  const digest = blake2b(new TextEncoder().encode(canonicalize(stripped)), { dkLen: 32 });
  const pk = hexToBytes(sig.public_key);
  const sigBytes = hexToBytes(sig.signature);
  let valid: boolean;
  try {
    valid = ed25519.verify(sigBytes, digest, pk);
  } catch (err) {
    return {
      ok: false,
      code: "BAD_SIGNATURE",
      message: `verification threw: ${(err as Error).message ?? String(err)}`,
    };
  }
  if (!valid) {
    return { ok: false, code: "BAD_SIGNATURE", message: "signature does not verify" };
  }
  return { ok: true };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function stripSignature(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature: _omit, ...rest } = obj;
  return rest;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${hex}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function nowIsoUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
