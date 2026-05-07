// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-rosen — types
//
// Rosen-bridged stablecoins ride on the Ergo Note primitive: same R4/R6/R7
// register layout as a plain Ergo Note, but the value lives in the box's
// tokens[] array (not the box's nanoERG `value`). The adapter is essentially
// rails-ergo with token-aware value lookups.
// ─────────────────────────────────────────────────────────────────────────────

export type RosenCurrency = "rsUSDT" | "rsUSDC" | "rsBTC";

export interface RosenTokenEntry {
  /** 64-hex token id of the wrapped asset on Ergo. */
  tokenId: string;
  /** Token decimals (rsUSDT: 6, rsUSDC: 6, rsBTC: 8 — verify per network). */
  decimals: number;
}

/**
 * Caller-supplied registry mapping Accord currency names to their on-chain
 * token-ids and decimals. Token-ids differ between testnet and mainnet so
 * we keep this configurable rather than baking constants into the package.
 *
 * Example mainnet (verify before use):
 *
 * ```ts
 * const ROSEN_MAINNET = {
 *   rsUSDT: { tokenId: "...", decimals: 6 },
 *   rsUSDC: { tokenId: "...", decimals: 6 },
 *   rsBTC:  { tokenId: "...", decimals: 8 },
 * };
 * ```
 */
export type RosenTokenRegistry = Partial<Record<RosenCurrency, RosenTokenEntry>>;

/** What the buyer attaches to a paid call. */
export interface RosenPaymentProof {
  /** 64-hex Ergo box id of the Note carrying the wrapped token. */
  note_box_id: string;
  /** Raw task-output bytes the buyer pre-committed to. blake2b256(taskOutput) MUST equal R6. */
  task_output: string | Uint8Array;
  /** Optional override for the redemption recipient. */
  receiver_address?: string;
}

/** Subset of the upstream NoteInfo we need, plus a tokens[] array. */
export interface RosenNoteInfoLite {
  boxId: string;
  /** ERG value of the box — typically just MIN_BOX_VALUE for token-carrying Notes; the real value is in tokens[]. */
  value: bigint;
  expiryBlock: number;
  currentBlock: number;
  isExpired: boolean;
  reserveBoxId?: string;
  taskHash?: string;
  /** Token list pulled from the underlying box. */
  tokens: Array<{ tokenId: string; amount: bigint }>;
}

/** Subset of the upstream agent the adapter calls. */
export interface RosenNoteOps {
  network: "mainnet" | "testnet";
  /** Same as rails-ergo's checkNote, but the returned NoteInfo MUST include tokens[]. */
  checkNote(noteBoxId: string): Promise<RosenNoteInfoLite>;
  redeemNote(opts: {
    noteBoxId: string;
    taskOutput?: string | Uint8Array;
    receiverAddress?: string;
  }): Promise<{ txId?: string; submitted: boolean }>;
}

export interface RosenRailAdapterOptions {
  ops: RosenNoteOps;
  /** Token-id + decimals registry for this network. */
  tokens: RosenTokenRegistry;
  /** Override the `tx.network` field on emitted Settlement Receipts. */
  network?: "mainnet" | "testnet";
}
