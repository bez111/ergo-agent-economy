// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — type definitions
// ─────────────────────────────────────────────────────────────────────────────

import type { Address, Hex, PublicClient, WalletClient } from "viem";

/** Network identifier — `base` (mainnet) or `base-sepolia` (testnet). */
export type BaseNetwork = "base" | "base-sepolia";

export interface BaseAgentPayConfig {
  /** EVM address the agent operates from. */
  address: Address;
  /** Target network. Default: `base-sepolia`. */
  network?: BaseNetwork;
  /** Address of the deployed `AgentPayReserveV0` contract. */
  reserveContract: Address;
  /** Address of the ERC-20 token used by this reserve (USDC, USDT, …). */
  tokenContract: Address;
  /** viem PublicClient — for reads. */
  publicClient: PublicClient;
  /** viem WalletClient — for writes. Optional; without it, the SDK is read-only. */
  walletClient?: WalletClient;

  /**
   * Bypass the audit gate on mainnet. Same semantics as ergo-agent-pay's
   * flag — strongly discouraged. Defaults to false.
   */
  dangerouslyAllowUnauditedContract?: boolean;

  /**
   * Audit policy for mainnet. Receives the contract's runtime bytecode
   * hash; returns ok=true to allow, ok=false to refuse. The integrator
   * wires this with the `agentpay-base` audit manifest (see
   * `data/AUDITED_CONTRACTS.json`) the same way `ergo-agent-pay` wires
   * the Ergo manifest.
   */
  auditPolicy?: AuditPolicy;
}

export type AuditPolicy = (
  bytecodeHash: Hex,
  network: BaseNetwork
) => AuditPolicyVerdict | Promise<AuditPolicyVerdict>;

export type AuditPolicyVerdict = { ok: true } | { ok: false; reason: string };

export interface NoteOptions {
  /** EVM address of the recipient — must call `redeemNote` themselves. */
  recipient: Address;
  /** Amount in token base units (USDC: 6 decimals → 5_000_000n = 5 USDC). */
  amount: bigint;
  /**
   * Expiry block height. Use `+N blocks` to compute relative to current,
   * or pass a number for absolute. After expiry the recipient cannot
   * redeem; the issuer can call `refundExpired` to recover the locked
   * amount.
   */
  expiry: bigint | `+${number} blocks` | `+${number} block`;
  /**
   * Pre-computed task hash (keccak256 of the expected task output). Use
   * `computeTaskHash(...)` to derive. Pass `undefined` or zero hash for
   * an unconditional Note.
   */
  taskHash?: Hex;
}

export interface NoteInfo {
  /** Deterministic id of the Note (issuer + nonce + contract). */
  noteId: Hex;
  /** Issuer's EVM address. */
  issuer: Address;
  /** Recipient's EVM address. */
  recipient: Address;
  /** Amount in token base units. */
  amount: bigint;
  /** Block height at which the Note becomes non-redeemable. */
  expiryBlock: bigint;
  /** Acceptance-predicate task hash. `0x00...` means unconditional. */
  taskHash: Hex;
  /** Whether the Note has already been redeemed or refunded. */
  redeemed: boolean;
  /** Current block height at the time of the read. */
  currentBlock: bigint;
  /** True iff `currentBlock >= expiryBlock`. */
  isExpired: boolean;
  /** True iff the Note was found (issuer != zero address). */
  exists: boolean;
}

export interface IssueNoteResult {
  /** Tx hash for the issuance. */
  txHash: Hex;
  /** Deterministic note id (also emitted in the `NoteIssued` event). */
  noteId: Hex;
}

export interface RedeemNoteResult {
  txHash: Hex;
}

export class BaseAgentPayError extends Error {
  constructor(
    message: string,
    public readonly code: BaseAgentPayErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "BaseAgentPayError";
  }
}

export type BaseAgentPayErrorCode =
  | "NO_WALLET_CLIENT"
  | "INVALID_AMOUNT"
  | "INVALID_EXPIRY"
  | "NOTE_NOT_FOUND"
  | "INSUFFICIENT_RESERVE"
  | "UNAUDITED_CONTRACT"
  | "INSECURE_MAINNET_MODE"
  | "TX_FAILED"
  | "TASK_HASH_MISMATCH";
