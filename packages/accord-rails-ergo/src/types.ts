// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-ergo — types
//
// Defines the buyer's payment-proof shape for the Ergo Note rail and the
// minimal `ErgoNoteOps` interface the adapter takes. ErgoNoteOps is a subset
// of `ergo-agent-pay`'s `ErgoAgentPay` so production code passes an
// ErgoAgentPay instance directly; tests pass an in-memory stub.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the buyer attaches to a paid call. The MCP wrapper / HTTP gateway
 * pulls this out of the request and hands it to verifyPayment().
 *
 * Wire shape (JSON):
 * ```json
 * {
 *   "note_box_id": "<64 hex>",
 *   "task_output": "{\"word_count\":2}",
 *   "receiver_address": "9XSeller..."
 * }
 * ```
 */
export interface ErgoPaymentProof {
  /** 64-hex Note box id created when the buyer issued the Note. */
  note_box_id: string;
  /** Raw task-output bytes (or string) the buyer pre-committed to. blake2b256(taskOutput) MUST equal the Note's R6. */
  task_output: string | Uint8Array;
  /** Optional override for the redemption recipient. Defaults to the seller's address. */
  receiver_address?: string;
}

/** Subset of `ergo-agent-pay`'s `ErgoAgentPay` the adapter actually calls. */
export interface ErgoNoteOps {
  /** "mainnet" or "testnet" — used to set the network field of the Settlement Receipt. */
  network: "mainnet" | "testnet";

  /** Fetch a Note from the chain and decode its registers. */
  checkNote(noteBoxId: string): Promise<NoteInfoLite>;

  /**
   * Spend a Note, releasing its ERG to the receiver. Throws on rail failure.
   *
   * `taskOutput` is the bytes the on-chain predicate hashes and matches
   * against R6. For v0 the wrapper supplies it from the buyer's
   * `ErgoPaymentProof.task_output`.
   */
  redeemNote(opts: {
    noteBoxId: string;
    taskOutput?: string | Uint8Array;
    receiverAddress?: string;
  }): Promise<RedeemResultLite>;
}

/**
 * Subset of `ergo-agent-pay`'s `NoteInfo` that the adapter inspects.
 * Kept narrower than the upstream type so this package doesn't take a
 * runtime dependency on `ergo-agent-pay` (only a peerDependency).
 */
export interface NoteInfoLite {
  boxId: string;
  value: bigint;
  expiryBlock: number;
  currentBlock: number;
  isExpired: boolean;
  reserveBoxId?: string;
  taskHash?: string;
  credentialKey?: string;
}

/** Subset of `ergo-agent-pay`'s `RedeemResult`. */
export interface RedeemResultLite {
  txId?: string;
  submitted: boolean;
}

/** Adapter construction options. */
export interface ErgoRailAdapterOptions {
  /** Pluggable note-ops (typically an `ErgoAgentPay` instance). */
  ops: ErgoNoteOps;
  /**
   * The network override sent into Settlement Receipts' `tx.network` field.
   * Defaults to `ops.network`.
   */
  network?: "mainnet" | "testnet";
}
