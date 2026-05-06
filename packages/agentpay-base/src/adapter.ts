// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — main adapter
//
// Mirrors the shape of `ergo-agent-pay`'s `ErgoAgentPay` class but talks to
// the EVM `AgentPayReserveV0` contract over viem. Apps switch chains by
// instantiating a different adapter; the SPEC stays the same.
//
// Key differences from the Ergo adapter (documented in README.md):
//   * receiver-bound by default (msg.sender == note.recipient enforced
//     by the contract; no front-running risk that motivated the
//     credential_v0 / task_hash_v0 split on Ergo)
//   * keccak256 acceptance predicate instead of blake2b256
//   * refund-on-expiry path is explicit (issuer calls refundExpired)
//   * no Tracker (anti-double-spend is the redeemed bool in the Note struct)
// ─────────────────────────────────────────────────────────────────────────────

import {
  parseEventLogs,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { RESERVE_ABI, ERC20_ABI } from "./abi.js";
import { computeTaskHash, NO_TASK_HASH } from "./encoding.js";
import { assertProductionSafety } from "./safety.js";
import { BaseAgentPayError } from "./types.js";
import type {
  BaseAgentPayConfig,
  IssueNoteResult,
  NoteInfo,
  NoteOptions,
  RedeemNoteResult,
} from "./types.js";

export class BaseAgentPay {
  private readonly config: Required<
    Pick<BaseAgentPayConfig, "address" | "network" | "reserveContract" | "tokenContract" | "publicClient">
  > &
    Pick<BaseAgentPayConfig, "walletClient" | "auditPolicy" | "dangerouslyAllowUnauditedContract">;

  constructor(config: BaseAgentPayConfig) {
    this.config = {
      address: config.address,
      network: config.network ?? "base-sepolia",
      reserveContract: config.reserveContract,
      tokenContract: config.tokenContract,
      publicClient: config.publicClient,
      walletClient: config.walletClient,
      auditPolicy: config.auditPolicy,
      dangerouslyAllowUnauditedContract: config.dangerouslyAllowUnauditedContract,
    };
  }

  /** Current reserve balance for the agent's address (token base units). */
  async getReserveBalance(): Promise<bigint> {
    return (await this.config.publicClient.readContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "reserveBalance",
      args: [this.config.address],
    })) as bigint;
  }

  /** Token balance held by the agent's address (NOT the reserve balance). */
  async getTokenBalance(): Promise<bigint> {
    return (await this.config.publicClient.readContract({
      address: this.config.tokenContract,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.config.address],
    })) as bigint;
  }

  /** Decimals reported by the underlying ERC-20 (USDC = 6, USDT = 6, …). */
  async getTokenDecimals(): Promise<number> {
    return Number(
      await this.config.publicClient.readContract({
        address: this.config.tokenContract,
        abi: ERC20_ABI,
        functionName: "decimals",
      })
    );
  }

  /** Current chain block number. */
  async getBlockNumber(): Promise<bigint> {
    return this.config.publicClient.getBlockNumber();
  }

  /**
   * Approve and top up the reserve in one logical call. Approves only the
   * exact amount; safer than the unbounded approve pattern.
   */
  async topUp(amount: bigint): Promise<{ approveTxHash: Hex; topUpTxHash: Hex }> {
    if (amount <= 0n) {
      throw new BaseAgentPayError("amount must be > 0", "INVALID_AMOUNT");
    }
    await this.requireSafety("topUp");
    const wallet = this.requireWallet();

    const approveTxHash = await wallet.writeContract({
      address: this.config.tokenContract,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.config.reserveContract, amount],
      chain: null,
      account: this.config.address,
    });
    await this.config.publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    const topUpTxHash = await wallet.writeContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "topUp",
      args: [amount],
      chain: null,
      account: this.config.address,
    });
    await this.config.publicClient.waitForTransactionReceipt({ hash: topUpTxHash });

    return { approveTxHash, topUpTxHash };
  }

  /** Withdraw `amount` from the agent's reserve back to their wallet. */
  async withdraw(amount: bigint): Promise<{ txHash: Hex }> {
    if (amount <= 0n) {
      throw new BaseAgentPayError("amount must be > 0", "INVALID_AMOUNT");
    }
    await this.requireSafety("withdraw");
    const wallet = this.requireWallet();
    const txHash = await wallet.writeContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "withdraw",
      args: [amount],
      chain: null,
      account: this.config.address,
    });
    await this.config.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  /** Issue a Note. Returns the deterministic noteId derived from the receipt. */
  async issueNote(opts: NoteOptions): Promise<IssueNoteResult> {
    if (opts.amount <= 0n) {
      throw new BaseAgentPayError("amount must be > 0", "INVALID_AMOUNT");
    }
    await this.requireSafety("issueNote");
    const wallet = this.requireWallet();

    const expiryBlock = await this.resolveExpiry(opts.expiry);
    const taskHash = opts.taskHash ?? NO_TASK_HASH;

    // Pre-compute the noteId to make the result useful even before logs arrive.
    const previewedNoteId = (await this.config.publicClient.readContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "previewNoteId",
      args: [this.config.address],
    })) as Hex;

    const txHash = await wallet.writeContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "issueNote",
      args: [opts.recipient, opts.amount, expiryBlock, taskHash],
      chain: null,
      account: this.config.address,
    });
    const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Extract the actual noteId from the NoteIssued event in case nonces
    // moved (e.g., a parallel transaction landed first).
    const events = parseEventLogs({
      abi: RESERVE_ABI,
      eventName: "NoteIssued",
      logs: receipt.logs,
    });
    const event = events.find(
      (e) => e.args.issuer === this.config.address && e.address.toLowerCase() === this.config.reserveContract.toLowerCase()
    );
    const noteId = (event?.args.noteId ?? previewedNoteId) as Hex;
    return { txHash, noteId };
  }

  /** Redeem a Note. msg.sender must equal the Note's recipient. */
  async redeemNote(noteId: Hex, taskOutput?: string | Uint8Array): Promise<RedeemNoteResult> {
    await this.requireSafety("redeemNote");
    const wallet = this.requireWallet();
    const taskBytes =
      taskOutput === undefined
        ? "0x"
        : typeof taskOutput === "string"
        ? `0x${Buffer.from(taskOutput, "utf-8").toString("hex")}`
        : `0x${Buffer.from(taskOutput).toString("hex")}`;

    const txHash = await wallet.writeContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "redeemNote",
      args: [noteId, taskBytes as Hex],
      chain: null,
      account: this.config.address,
    });
    await this.config.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  /** Refund an expired Note back to the issuer's reserve. */
  async refundExpired(noteId: Hex): Promise<{ txHash: Hex }> {
    await this.requireSafety("refundExpired");
    const wallet = this.requireWallet();
    const txHash = await wallet.writeContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "refundExpired",
      args: [noteId],
      chain: null,
      account: this.config.address,
    });
    await this.config.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  /** Read a Note's current state on chain. */
  async checkNote(noteId: Hex): Promise<NoteInfo> {
    const note = (await this.config.publicClient.readContract({
      address: this.config.reserveContract,
      abi: RESERVE_ABI,
      functionName: "getNote",
      args: [noteId],
    })) as {
      issuer: Address;
      recipient: Address;
      amount: bigint;
      expiryBlock: bigint;
      taskHash: Hex;
      redeemed: boolean;
    };
    const currentBlock = await this.config.publicClient.getBlockNumber();
    const exists = note.issuer !== "0x0000000000000000000000000000000000000000";
    return {
      noteId,
      issuer: note.issuer,
      recipient: note.recipient,
      amount: note.amount,
      expiryBlock: note.expiryBlock,
      taskHash: note.taskHash,
      redeemed: note.redeemed,
      currentBlock,
      isExpired: exists && currentBlock >= note.expiryBlock,
      exists,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private requireWallet(): WalletClient {
    if (!this.config.walletClient) {
      throw new BaseAgentPayError(
        "BaseAgentPay was constructed without a walletClient — read-only mode. " +
          "Provide a viem WalletClient to perform writes.",
        "NO_WALLET_CLIENT"
      );
    }
    return this.config.walletClient;
  }

  private async requireSafety(operation: ProductionSafetyArgs["operation"]): Promise<void> {
    await assertProductionSafety({
      operation,
      network: this.config.network,
      reserveContract: this.config.reserveContract,
      publicClient: this.config.publicClient,
      auditPolicy: this.config.auditPolicy,
      dangerouslyAllowUnauditedContract: this.config.dangerouslyAllowUnauditedContract,
    });
  }

  private async resolveExpiry(expiry: NoteOptions["expiry"]): Promise<bigint> {
    if (typeof expiry === "bigint") return expiry;
    const m = expiry.match(/^\+(\d+)\s*blocks?$/);
    if (!m) {
      throw new BaseAgentPayError(
        `Invalid expiry "${expiry}". Use a bigint block height or "+N blocks".`,
        "INVALID_EXPIRY"
      );
    }
    const offset = BigInt(m[1]!);
    const head = await this.config.publicClient.getBlockNumber();
    return head + offset;
  }
}

// Local type re-import to keep `requireSafety` typed without circular deps.
type ProductionSafetyArgs = import("./safety.js").ProductionSafetyArgs;

// Re-export for convenience.
export { computeTaskHash, NO_TASK_HASH } from "./encoding.js";
