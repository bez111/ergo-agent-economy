// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Sigma encoding helpers
//
// Production-safe replacements for the hand-rolled `0e <lenHex> <bytes>` in
// the previous lifecycle builders. v0 keeps task outputs short and uses a
// single-byte length prefix; longer payloads need full Sigma varint encoding
// and are reserved for v1 (see SPEC.md §3 and the A-004 finding).
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPayError } from "./types.js";

/**
 * v0 limit on `taskOutput.length`. The single-byte length prefix used here
 * cannot represent values >= 256. Anything larger must wait for v1.
 */
export const MAX_TASK_OUTPUT_BYTES = 255;

/**
 * Encode a byte string as a Sigma `Coll[Byte]` constant in the format the
 * Ergo node expects in EIP-12 context-extension entries:
 *
 *     0e <length-byte> <raw-bytes>
 *
 * Throws `INVALID_ENCODING` if `bytes.length > MAX_TASK_OUTPUT_BYTES`. Use
 * this for context-variable 0 (the task output a Note's predicate compares
 * against) and for any other v0 `Coll[Byte]` payload.
 */
export function encodeSigmaCollByte(bytes: Uint8Array | Buffer | readonly number[]): string {
  const length = (bytes as { length: number }).length;
  if (length === 0) {
    // L-001: an empty Coll[Byte] hashes to a publicly-known constant. A Note
    // whose R6 is set to that constant + an empty taskOutput is semantically
    // a "redeem any time before expiry, no proof required" Note. Catching
    // empty payloads here forces the issuer to be deliberate about that.
    throw new ErgoAgentPayError(
      "Task output is empty. An empty Coll[Byte] hashes to a known constant " +
        "(blake2b256(\"\") = 0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8) " +
        "and produces a no-op predicate. If you intend an unconditional Note, " +
        "issue it without R6 instead.",
      "INVALID_ENCODING"
    );
  }
  if (length > MAX_TASK_OUTPUT_BYTES) {
    throw new ErgoAgentPayError(
      `Task output is ${length} bytes; v0 only supports up to ${MAX_TASK_OUTPUT_BYTES} bytes ` +
        `(Sigma single-byte length prefix). Use a content-addressed hash of the payload instead.`,
      "INVALID_ENCODING"
    );
  }

  const lenHex = length.toString(16).padStart(2, "0");
  const arr =
    bytes instanceof Uint8Array
      ? Array.from(bytes)
      : Array.isArray(bytes)
      ? bytes
      : Array.from(bytes as ArrayLike<number>);
  const hexBody = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0e${lenHex}${hexBody}`;
}
