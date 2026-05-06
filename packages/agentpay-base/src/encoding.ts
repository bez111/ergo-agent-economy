// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — task-output hashing
//
// Mirrors the role of `computeTaskHash` in `ergo-agent-pay`, but with the
// EVM-native hash. The same protocol-level rule holds: the off-chain hash
// MUST exactly match what the Solidity predicate checks. On EVM that's
// `keccak256`; on Ergo that's `blake2b256`.
//
// We deliberately use viem's `keccak256` for the off-chain side rather
// than rolling our own — it shares an audited primitive with every EVM
// app, and consumers of `viem` already pull it in.
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, stringToBytes, type Hex } from "viem";
import { BaseAgentPayError } from "./types.js";

/**
 * Compute keccak256(taskOutput). Matches Solidity's
 * `keccak256(taskOutput)` byte-for-byte when the taskOutput is supplied
 * via `redeemNote(noteId, taskOutputBytes)`.
 *
 * @example
 *   const hash = computeTaskHash("the answer is 42")
 *   await base.issueNote({ ..., taskHash: hash })
 *   // recipient later:
 *   await base.redeemNote(noteId, "the answer is 42")
 */
export function computeTaskHash(input: string | Uint8Array): Hex {
  const bytes = typeof input === "string" ? stringToBytes(input) : input;
  return keccak256(bytes);
}

/** The all-zero bytes32 — the contract treats this as "no acceptance predicate". */
export const NO_TASK_HASH: Hex = `0x${"0".repeat(64)}` as Hex;

/**
 * Validate that a string is a 0x-prefixed 64-hex-char value. Returns the
 * value typed as `Hex`; throws on bad input.
 */
export function asTaskHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new BaseAgentPayError(
      `Invalid task hash: must be 0x-prefixed 64-char hex (32 bytes). Got "${value}".`,
      "TASK_HASH_MISMATCH"
    );
  }
  return value as Hex;
}
