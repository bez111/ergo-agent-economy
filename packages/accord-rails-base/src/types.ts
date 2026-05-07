// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-base — types
//
// Shape of the buyer's payment proof for the Base/EVM rail and the minimal
// `BaseNoteOps` interface the adapter takes. Production code passes a
// `BaseAgentPay` instance from `agentpay-base`; tests pass an in-memory stub.
// ─────────────────────────────────────────────────────────────────────────────

/** Hex-encoded EVM value, prefixed with `0x`. */
export type Hex = `0x${string}`;

/**
 * What the buyer attaches to a paid call. Wire shape (JSON):
 *
 * ```json
 * {
 *   "note_id": "0x...",
 *   "task_output": "{\"word_count\":2}",
 *   "tx_hash": "0x..."        // optional — the issuance tx, used for receipt routing
 * }
 * ```
 */
export interface BasePaymentProof {
  /** Deterministic note id from `agentpay-base`. */
  note_id: Hex;
  /** Raw task-output bytes the buyer pre-committed to. keccak256(task_output) MUST equal note.taskHash. */
  task_output: string | Uint8Array;
  /** Optional tx-hash override for the issuance. */
  tx_hash?: Hex;
}

/** Subset of `agentpay-base`'s `BaseAgentPay` the adapter calls. */
export interface BaseNoteOps {
  /** "mainnet", "base-sepolia", "sepolia"… — used in Settlement Receipt's tx.network. */
  network: "mainnet" | "base-sepolia" | "sepolia" | "testnet";

  /** Fetch a Note from the contract and decode its fields. */
  checkNote(noteId: Hex): Promise<NoteInfoLite>;

  /** Spend a Note. Throws on contract reverts (insufficient reserve, task-hash mismatch, etc). */
  redeemNote(noteId: Hex, taskOutput?: string | Uint8Array): Promise<{ txHash: Hex }>;

  /** Refund a Note past its deadline. Optional — adapters that don't need it can omit. */
  refundExpired?(noteId: Hex): Promise<{ txHash: Hex }>;
}

/** Subset of `agentpay-base`'s `NoteInfo`. */
export interface NoteInfoLite {
  noteId: Hex;
  issuer: Hex;
  recipient: Hex;
  amount: bigint;
  expiryBlock: bigint;
  /** Acceptance-predicate task hash, hex-encoded. `0x00...` means unconditional. */
  taskHash: Hex;
  redeemed: boolean;
  currentBlock: bigint;
  isExpired: boolean;
  exists: boolean;
}

/** Adapter construction options. */
export interface BaseRailAdapterOptions {
  /** Pluggable note-ops (typically a `BaseAgentPay` instance). */
  ops: BaseNoteOps;
  /** Override the `tx.network` field on emitted Settlement Receipts. */
  network?: "mainnet" | "base-sepolia" | "sepolia" | "testnet";
}
