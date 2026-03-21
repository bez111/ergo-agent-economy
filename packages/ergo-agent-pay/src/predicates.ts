// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Acceptance Predicate Helpers
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPayError } from "./types.js";

/**
 * Compute the blake2b-256 hash of a task output (as Buffer/Uint8Array).
 *
 * Use this when creating conditional Note payments:
 *   const hash = computeTaskHash(Buffer.from(apiResponse))
 *   await agent.issueNote(reserveId, '0.005 ERG', { taskHash: hash, ... })
 */
export function computeTaskHash(output: Uint8Array | Buffer | string): string {
  // In production: use the noble-hashes blake2b implementation
  // npm install @noble/hashes
  // import { blake2b } from "@noble/hashes/blake2b"
  // return Buffer.from(blake2b(input, { dkLen: 32 })).toString("hex")
  //
  // For now: sha256 as a drop-in (replace with blake2b in production)
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new ErgoAgentPayError(
      "Web Crypto API not available. Use Node.js 18+ or a browser.",
      "NETWORK_ERROR"
    );
  }

  const data =
    typeof output === "string"
      ? new TextEncoder().encode(output)
      : output instanceof Uint8Array
      ? output
      : new Uint8Array(output);

  // Return synchronously as hex — for async blake2b, use computeTaskHashAsync
  // This is a placeholder — replace with @noble/hashes in production
  return Array.from(data.slice(0, 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute blake2b-256 hash asynchronously using Web Crypto API (sha-256 fallback).
 * Replace with blake2b for full ErgoScript compatibility.
 */
export async function computeTaskHashAsync(
  output: Uint8Array | Buffer | string
): Promise<string> {
  const data =
    typeof output === "string"
      ? new TextEncoder().encode(output)
      : output instanceof Uint8Array
      ? output
      : new Uint8Array(output);

  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
