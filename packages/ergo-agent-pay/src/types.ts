// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type Network = "mainnet" | "testnet";

// ── Configuration ─────────────────────────────────────────────────────────────

export interface ErgoAgentPayConfig {
  /** Ergo address of the agent */
  address: string;

  /** Network to operate on. Default: "mainnet" */
  network?: Network;

  /** Signer function. Receives unsigned EIP-12 TX, returns signed TX.
   *  If omitted, transactions are returned unsigned for external signing. */
  signer?: SignerFn;

  /** Policy hooks — called before/after every transaction */
  policy?: PolicyConfig;

  /** Custom API node URL. Defaults to the public Ergo API. */
  nodeUrl?: string;
}

export type SignerFn = (unsignedTx: EIP12UnsignedTx) => Promise<SignedTx>;

// ── Payment ───────────────────────────────────────────────────────────────────

export interface PayOptions {
  /** Arbitrary metadata stored in R4 (UTF-8 string → hex encoded) */
  memo?: string;

  /** Custom spending script for the output (advanced) */
  script?: string;
}

export interface PayResult {
  /** EIP-12 unsigned transaction — always present */
  unsignedTx: EIP12UnsignedTx;

  /** Signed transaction — present only if a signer was configured */
  signedTx?: SignedTx;

  /** Transaction ID — present only if submitted to the network */
  txId?: string;

  /** Whether the transaction was submitted */
  submitted: boolean;
}

// ── Note (bearer instrument) ──────────────────────────────────────────────────

export interface NoteOptions {
  /** Receiver address */
  recipient: string;

  /** Amount in nanoERG */
  value: bigint | string | number;

  /** Reserve box ID backing this Note */
  reserveBoxId: string;

  /** Expiry as absolute block height or "+N blocks" relative offset */
  deadline: number | `+${number} blocks`;

  /** Acceptance predicate: task hash (hex, 32 bytes) */
  taskHash?: string;

  /** Acceptance predicate: required credential public key (GroupElement hex) */
  credentialKey?: string;
}

export interface NoteResult extends PayResult {
  /** Encoded note output for inspection */
  noteOutput: {
    value: string;
    recipient: string;
    reserveBoxId: string;
    expiryBlock: number;
    taskHash?: string;
  };
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface PolicyConfig {
  /** Called before every payment. Return false to reject. */
  beforePay?: BeforePayHook;

  /** Called after every successful payment. */
  afterPay?: AfterPayHook;

  /** Maximum single payment in nanoERG. Default: unlimited. */
  maxSinglePayment?: bigint;

  /** Maximum total spend per session in nanoERG. Default: unlimited. */
  maxSessionSpend?: bigint;

  /** Require explicit approval for payments above this threshold (nanoERG) */
  requireApprovalAbove?: bigint;

  /** Approval callback — called when requireApprovalAbove is triggered */
  approvalFn?: ApprovalFn;
}

export type BeforePayHook = (ctx: PayContext) => boolean | Promise<boolean>;
export type AfterPayHook = (ctx: PayContext, result: PayResult) => void | Promise<void>;
export type ApprovalFn = (ctx: PayContext) => boolean | Promise<boolean>;

export interface PayContext {
  to: string;
  value: bigint;
  memo?: string;
  sessionSpend: bigint;
  timestamp: number;
}

// ── LangChain / OpenAI adapters ───────────────────────────────────────────────

export interface LangChainToolConfig {
  /** Tool name exposed to the LLM. Default: "ergo_pay" */
  name?: string;

  /** Tool description. Default: auto-generated. */
  description?: string;
}

export interface OpenAIFunctionConfig {
  /** Function name. Default: "ergo_pay" */
  name?: string;
}

// ── Internal EIP-12 / TX types ────────────────────────────────────────────────

/** EIP-12 unsigned transaction (passed to wallets / external signers) */
export type EIP12UnsignedTx = Record<string, unknown>;

/** Signed transaction ready for submission */
export type SignedTx = Record<string, unknown>;

// ── Errors ────────────────────────────────────────────────────────────────────

export class ErgoAgentPayError extends Error {
  constructor(
    message: string,
    public readonly code: ErgoAgentPayErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ErgoAgentPayError";
  }
}

export type ErgoAgentPayErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "POLICY_REJECTED"
  | "APPROVAL_DENIED"
  | "NO_SIGNER"
  | "NETWORK_ERROR"
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "INVALID_HASH"
  | "SUBMISSION_FAILED";
