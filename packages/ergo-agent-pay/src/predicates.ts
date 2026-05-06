// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Acceptance Predicate Helpers
//
// All hashing here is BLAKE2b-256 — the same hash function used by ErgoScript's
// `blake2b256(...)` builtin. Computing a different hash off-chain (e.g. SHA-256)
// will silently break Note redemption: the on-chain predicate would reject every
// task output. See SPEC.md for the formal definition and golden test vectors.
// ─────────────────────────────────────────────────────────────────────────────

import { blake2b } from "@noble/hashes/blake2b";
import { ErgoAgentPayError } from "./types.js";

/**
 * Compute BLAKE2b-256 of `output`. The result is the hex string written to
 * R6 of a Note when issuing a task-bound payment, and the value an on-chain
 * predicate compares against.
 *
 * @example
 *   const hash = computeTaskHash("the answer is 42")
 *   await agent.issueNote({ ..., taskHash: hash })
 */
export function computeTaskHash(output: Uint8Array | Buffer | string): string {
  const data = toBytes(output);
  const digest = blake2b(data, { dkLen: 32 });
  return toHex(digest);
}

/**
 * Async variant — kept for API parity with the previous Web Crypto path.
 * BLAKE2b is fast and synchronous, so this just wraps `computeTaskHash`.
 */
export async function computeTaskHashAsync(
  output: Uint8Array | Buffer | string
): Promise<string> {
  return computeTaskHash(output);
}

function toBytes(input: Uint8Array | Buffer | string): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Parse a deadline specification into an absolute block height.
 *
 * @example
 * resolveDeadline("+100 blocks", 1200000) // → 1200100
 * resolveDeadline(1300000, 1200000)        // → 1300000
 */
export function resolveDeadline(
  deadline: number | `+${number} blocks` | `+${number} block`,
  currentHeight: number
): number {
  if (typeof deadline === "number") return deadline;

  const match = deadline.match(/^\+(\d+)\s*blocks?$/i);
  if (!match || !match[1]) {
    throw new ErgoAgentPayError(
      `Invalid deadline format: "${deadline}". Use "+N blocks" or an absolute block number.`,
      "INVALID_AMOUNT"
    );
  }

  return currentHeight + parseInt(match[1], 10);
}

/**
 * Validate a task hash — must be a 64-character hex string (32 bytes).
 */
export function validateTaskHash(hash: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    throw new ErgoAgentPayError(
      `Invalid task hash: must be 64 hex characters (32 bytes). Got: "${hash}"`,
      "INVALID_HASH"
    );
  }
}

/**
 * Encode a UTF-8 string to a hex string for register storage.
 */
export function encodeToHex(str: string): string {
  return toHex(new TextEncoder().encode(str));
}

/**
 * The ErgoScript acceptance predicate template for task hash verification.
 * This is the script that goes in the Note's spending condition.
 *
 * For use with ergo-lib-wasm or AppKit when building the Note UTxO.
 */
export const TASK_HASH_PREDICATE_SCRIPT = `{
  // Acceptance predicate: task hash verification with deadline
  // R5: expiry block height (SInt)
  // R6: expected task output hash (SColl[SByte], 32 bytes)
  //
  // To redeem: provide task output as context variable 0
  val expiry       = R5[Int].get
  val expectedHash = R6[Coll[Byte]].get
  val taskOutput   = getVar[Coll[Byte]](0).get
  val actualHash   = blake2b256(taskOutput)
  sigmaProp(HEIGHT < expiry && actualHash == expectedHash)
}` as const;

/**
 * ErgoScript for credential-gated acceptance predicate.
 * R5: expiry, R6: task hash, R7: authorized public key (GroupElement)
 */
export const CREDENTIAL_PREDICATE_SCRIPT = `{
  val expiry       = R5[Int].get
  val expectedHash = R6[Coll[Byte]].get
  val authorizedPK = R7[GroupElement].get
  val taskOutput   = getVar[Coll[Byte]](0).get
  sigmaProp(
    HEIGHT < expiry &&
    blake2b256(taskOutput) == expectedHash &&
    proveDlog(authorizedPK)
  )
}` as const;
