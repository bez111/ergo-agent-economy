// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-scripts — type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type PredicateName =
  // Acceptance predicates the SDK ships with
  | "task_hash_v0"
  | "credential_v0"
  // ChainCash on-chain contracts (vendored from kushti/ChainCash)
  | "chaincash_reserve_v0"
  | "chaincash_note_v0"
  | "chaincash_receipt_v0"
  // Basis offchain-credit reserves (vendored from kushti/ChainCash/offchain)
  | "basis_reserve_v0"
  | "basis_token_reserve_v0";

export interface PredicateEntry {
  /** Stable identifier; corresponds to `PredicateName`. */
  name: PredicateName;

  /** One-line description of what redemption / spending proves. */
  purpose: string;

  /**
   * Verbatim ErgoScript source.
   *
   * Either `source` (inline) or `sourceFile` (relative path under data/) is
   * present; `sourceFile` wins when both are. The runtime registry strips
   * `sourceFile` after loading and stores the resolved text on `source`.
   */
  source?: string;

  /** Path relative to data/, e.g. "sources/reserve.es". */
  sourceFile?: string;

  /** Map of register slot → human-readable type. Documentation only. */
  registers?: Record<string, string>;

  /** Map of context-variable index → expected payload. Documentation only. */
  context_variables?: Record<string, string>;

  /** Map of token slot → meaning. Documentation only. */
  tokens?: Record<string, string>;

  /**
   * Map of placeholder name → semantic description. The compile script
   * resolves a placeholder named `XContractHash` against the dependency
   * whose name contains the stem `X` (case-insensitive).
   *
   * Example for `chaincash_note_v0`:
   *   templateVariables: {
   *     reserveContractHash: "...",
   *     receiptContractHash: "...",
   *   },
   *   dependsOn: ["chaincash_reserve_v0", "chaincash_receipt_v0"]
   */
  templateVariables?: Record<string, string>;

  /** Names of predicates this one depends on (compiled before, hash injected). */
  dependsOn?: PredicateName[];

  /**
   * Compiled ErgoTree, hex-encoded.
   *
   * `null` when the package was published without a compiled artefact.
   * Populated by `npm run compile-predicates`, which uses
   * `@fleet-sdk/compiler` to compile the source.
   *
   * Consumers MUST treat `null` as "no compiled tree available" and either
   * compile themselves or run in dev mode (testnet / `allowInsecureDevMode`).
   */
  ergoTreeHex: string | null;

  /**
   * BLAKE2b-256 of the raw ErgoTree bytes — a stable identifier for the
   * compiled artefact. Useful for quick equality checks and audit logs.
   */
  treeHashBlake2b256: string | null;

  /** ISO-8601 timestamp of compilation, or null if unset. */
  compiledAt: string | null;

  /** Identifier of the compiler used (name + version). */
  compiler: string | null;
}

export interface PredicateRegistry {
  spec: string;
  version: "v0";
  description: string;
  predicates: PredicateEntry[];
}
