// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Main Class
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ErgoAgentPayConfig,
  PayOptions,
  PayResult,
  NoteOptions,
  NoteResult,
  NoteInfo,
  ReserveConfig,
  ReserveResult,
  RedeemOptions,
  RedeemResult,
  BatchSettleOptions,
  BatchSettleResult,
  TrackerConfig,
  TrackerResult,
  PayContext,
  LangChainToolConfig,
  OpenAIFunctionConfig,
  EIP12UnsignedTx,
} from "./types.js";
import { ErgoAgentPayError } from "./types.js";
import { NetworkClient } from "./network.js";
import { PolicyEngine } from "./policy.js";
import { buildPayTx, buildNoteTx, parseAmount } from "./transactions.js";
import { resolveDeadline } from "./predicates.js";
import {
  buildCreateReserveTx,
  buildRedeemNoteTx,
  buildBatchSettleTx,
  buildDeployTrackerTx,
  decodeRegisterInt,
  decodeRegisterBytes,
} from "./lifecycle.js";

export class ErgoAgentPay {
  private readonly config: Required<Omit<ErgoAgentPayConfig, "signer" | "policy">> &
    Pick<ErgoAgentPayConfig, "signer" | "policy">;
  private readonly network: NetworkClient;
  private readonly policy: PolicyEngine;

  constructor(config: ErgoAgentPayConfig) {
    if (!config.address) {
      throw new ErgoAgentPayError("address is required.", "INVALID_ADDRESS");
    }

    this.config = {
      address: config.address,
      network: config.network ?? "mainnet",
      signer: config.signer,
      policy: config.policy,
      nodeUrl: config.nodeUrl ?? "",
    };

    this.network = new NetworkClient(
      this.config.network,
      this.config.nodeUrl || undefined
    );

    this.policy = new PolicyEngine(config.policy ?? {});
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Send ERG to a receiver.
   *
   * @example
   * const result = await agent.pay("3Wh...", "0.001 ERG")
   * console.log(result.txId) // undefined if no signer, txId if submitted
   */
  async pay(
    to: string,
    amount: bigint | string | number,
    options: PayOptions = {}
  ): Promise<PayResult> {
    const valueNanoErg = parseAmount(amount);

    const ctx: PayContext = {
      to,
      value: valueNanoErg,
      memo: options.memo,
      sessionSpend: this.policy.totalSessionSpend,
      timestamp: Date.now(),
    };

    await this.policy.checkBefore(ctx);

    const [inputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    if (!inputs.length) {
      throw new ErgoAgentPayError(
        `No UTxOs found for address ${this.config.address}. Fund the wallet first.`,
        "INSUFFICIENT_FUNDS"
      );
    }

    const unsignedTx = buildPayTx(
      inputs,
      height,
      this.config.address,
      to,
      valueNanoErg,
      options
    );

    const result = await this.signAndMaybeSubmit(unsignedTx);
    await this.policy.recordAfter(ctx, result);
    return result;
  }

  /**
   * Issue a Note — a programmable bearer IOU with acceptance conditions.
   *
   * @example
   * const result = await agent.issueNote({
   *   recipient: subAgentAddress,
   *   value: "0.005 ERG",
   *   reserveBoxId: "abc123...",
   *   deadline: "+100 blocks",
   *   taskHash: computeTaskHash(expectedOutput),
   * })
   */
  async issueNote(opts: NoteOptions): Promise<NoteResult> {
    const valueNanoErg = parseAmount(opts.value);

    const ctx: PayContext = {
      to: opts.recipient,
      value: valueNanoErg,
      sessionSpend: this.policy.totalSessionSpend,
      timestamp: Date.now(),
    };

    await this.policy.checkBefore(ctx);

    const [inputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    if (!inputs.length) {
      throw new ErgoAgentPayError(
        `No UTxOs found for address ${this.config.address}.`,
        "INSUFFICIENT_FUNDS"
      );
    }

    const expiryBlock = resolveDeadline(opts.deadline, height);
    const unsignedTx = buildNoteTx(inputs, height, this.config.address, opts);
    const baseResult = await this.signAndMaybeSubmit(unsignedTx);

    const result: NoteResult = {
      ...baseResult,
      noteOutput: {
        value: valueNanoErg.toString(),
        recipient: opts.recipient,
        reserveBoxId: opts.reserveBoxId,
        expiryBlock,
        taskHash: opts.taskHash,
      },
    };

    await this.policy.recordAfter(ctx, result);
    return result;
  }

  /**
   * Get the current ERG balance of the agent wallet.
   */
  async getBalance(): Promise<{ nanoErgs: bigint; ergs: string }> {
    const { nanoErgs } = await this.network.getAddressBalance(this.config.address);
    const ergs = (Number(nanoErgs) / 1_000_000_000).toFixed(9).replace(/\.?0+$/, "");
    return { nanoErgs, ergs };
  }

  /**
   * Get the current Ergo block height.
   */
  async getHeight(): Promise<number> {
    return this.network.getHeight();
  }

  /**
   * Total ERG spent in this session.
   */
  get sessionSpend(): bigint {
    return this.policy.totalSessionSpend;
  }

  /**
   * Reset the session spend counter (e.g. for a new task batch).
   */
  resetSession(): void {
    this.policy.resetSession();
  }

  // ── Note lifecycle ────────────────────────────────────────────────────────

  /**
   * Fetch a Note box and decode its state: value, expiry, task hash, reserve ID.
   *
   * @example
   * const info = await agent.checkNote(noteBoxId)
   * if (info.isExpired) console.log("Note expired at block", info.expiryBlock)
   * if (info.taskHash) console.log("Acceptance predicate:", info.taskHash)
   */
  async checkNote(noteBoxId: string): Promise<NoteInfo> {
    let box: unknown;
    try {
      box = await this.network.getBox(noteBoxId);
    } catch {
      throw new ErgoAgentPayError(
        `Note box ${noteBoxId} not found on ${this.config.network}.`,
        "BOX_NOT_FOUND"
      );
    }

    const currentBlock = await this.network.getHeight();
    const b = box as {
      boxId: string;
      value: string | number;
      additionalRegisters?: Record<string, string>;
    };

    const regs = b.additionalRegisters ?? {};
    const expiryBlock = regs.R5 ? decodeRegisterInt(regs.R5) : 0;
    const reserveBoxId = regs.R4 ? decodeRegisterBytes(regs.R4) : undefined;
    const taskHash = regs.R6 ? decodeRegisterBytes(regs.R6) : undefined;
    const credentialKey = regs.R7 ? decodeRegisterBytes(regs.R7) : undefined;

    const valueNano = BigInt(b.value);

    return {
      boxId: noteBoxId,
      value: valueNano,
      ergs: (Number(valueNano) / 1e9).toFixed(9).replace(/\.?0+$/, ""),
      expiryBlock,
      currentBlock,
      isExpired: currentBlock >= expiryBlock,
      reserveBoxId,
      taskHash: taskHash || undefined,
      credentialKey: credentialKey || undefined,
      raw: box,
    };
  }

  /**
   * Redeem a Note — spend it and release ERG to the receiver.
   *
   * For acceptance-predicate-protected Notes, provide `taskOutput` matching
   * the hash stored in R6. The output bytes are injected as context variable 0.
   * Miners run `blake2b256(getVar[Coll[Byte]](0).get)` and verify against R6.
   *
   * @example
   * const result = await agent.redeemNote({
   *   noteBoxId: "abc123...",
   *   taskOutput: "The answer is 42",   // proves task completion on-chain
   *   receiverAddress: myAddress,
   * })
   */
  async redeemNote(opts: RedeemOptions): Promise<RedeemResult> {
    const noteBox = await this.network.getBox(opts.noteBoxId).catch(() => {
      throw new ErgoAgentPayError(
        `Note box ${opts.noteBoxId} not found.`,
        "BOX_NOT_FOUND"
      );
    });

    const [feeInputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    const receiver = opts.receiverAddress ?? this.config.address;
    const unsignedTx = buildRedeemNoteTx(noteBox, feeInputs, height, this.config.address, opts);
    const baseResult = await this.signAndMaybeSubmit(unsignedTx);

    return {
      ...baseResult,
      redeemed: {
        noteBoxId: opts.noteBoxId,
        value: BigInt((noteBox as { value: string | number }).value).toString(),
        receiver,
      },
    };
  }

  /**
   * Deploy a Reserve box — the collateral backing a Note issuance system.
   *
   * For production: compile the ChainCash Reserve ErgoScript with ergo-lib-wasm
   * and pass the ergoTree as `config.scriptErgoTree`. Without it, the collateral
   * is locked in a P2PK box (suitable for development/testnet demos only).
   *
   * @example
   * const reserve = await agent.createReserve({ collateral: "10 ERG" })
   * console.log("Reserve TX:", reserve.unsignedTx)
   * // Use the resulting boxId as `reserveBoxId` in issueNote()
   */
  async createReserve(config: ReserveConfig): Promise<ReserveResult> {
    const [inputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    if (!inputs.length) {
      throw new ErgoAgentPayError(
        `No UTxOs found for address ${this.config.address}.`,
        "INSUFFICIENT_FUNDS"
      );
    }

    const unsignedTx = buildCreateReserveTx(inputs, height, this.config.address, config);
    const baseResult = await this.signAndMaybeSubmit(unsignedTx);
    const collateral = parseAmount(config.collateral);

    return {
      ...baseResult,
      reserve: {
        value: collateral.toString(),
        hasScript: !!config.scriptErgoTree,
      },
    };
  }

  /**
   * Deploy a Tracker box — the on-chain anti-double-spend registry for Notes.
   *
   * Every Note redemption must reference this Tracker. The Tracker script
   * verifies the Note has not been redeemed before and outputs an updated
   * Tracker with the Note ID added to the spent set.
   *
   * Requires a compiled ErgoScript ergoTree (use ChainCash's Tracker script).
   *
   * @example
   * const tracker = await agent.deployTracker({
   *   scriptErgoTree: COMPILED_TRACKER_ERGOTREE,
   * })
   */
  async deployTracker(config: TrackerConfig): Promise<TrackerResult> {
    const [inputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    if (!inputs.length) {
      throw new ErgoAgentPayError(
        `No UTxOs found for address ${this.config.address}.`,
        "INSUFFICIENT_FUNDS"
      );
    }

    const unsignedTx = buildDeployTrackerTx(inputs, height, this.config.address, config);
    const baseResult = await this.signAndMaybeSubmit(unsignedTx);

    return {
      ...baseResult,
      tracker: {
        hasScript: true,
      },
    };
  }

  /**
   * Settle multiple Notes in a single transaction — batch redemption.
   *
   * All Notes are spent as inputs. The total ERG (minus fee) goes to the receiver.
   * Task outputs for predicate-protected Notes are injected per-input.
   *
   * Best practice: batch at the end of a work session to minimize on-chain fees.
   *
   * @example
   * const result = await agent.settleBatch({
   *   noteBoxIds: ["abc...", "def...", "ghi..."],
   *   taskOutputs: {
   *     "abc...": "result of task 1",
   *     "def...": "result of task 2",
   *   },
   *   receiverAddress: providerAddress,
   * })
   * console.log(`Settled ${result.settlement.noteCount} notes, total ${result.settlement.totalValue} nanoERG`)
   */
  async settleBatch(opts: BatchSettleOptions): Promise<BatchSettleResult> {
    if (!opts.noteBoxIds.length) {
      throw new ErgoAgentPayError("noteBoxIds must not be empty.", "INVALID_AMOUNT");
    }

    // Fetch all Note boxes in parallel
    const noteBoxes = await Promise.all(
      opts.noteBoxIds.map((id) =>
        this.network.getBox(id).catch(() => {
          throw new ErgoAgentPayError(`Note box ${id} not found.`, "BOX_NOT_FOUND");
        })
      )
    );

    const [feeInputs, height] = await Promise.all([
      this.network.getUnspentBoxes(this.config.address),
      this.network.getHeight(),
    ]);

    const receiver = opts.receiverAddress ?? this.config.address;
    const unsignedTx = buildBatchSettleTx(noteBoxes, feeInputs, height, this.config.address, opts);
    const baseResult = await this.signAndMaybeSubmit(unsignedTx);

    const totalValue = noteBoxes.reduce(
      (sum, box) => sum + BigInt((box as { value: string | number }).value),
      0n
    );

    return {
      ...baseResult,
      settlement: {
        noteCount: opts.noteBoxIds.length,
        totalValue: totalValue.toString(),
        receiver,
      },
    };
  }

  // ── LangChain adapter ────────────────────────────────────────────────────

  /**
   * Returns a LangChain DynamicTool that lets an LLM pay ERG.
   * The LLM calls the tool with { to, amount, memo } JSON.
   *
   * @example
   * import { AgentExecutor } from "langchain/agents"
   * const tools = [agent.asLangChainTool()]
   * const executor = await AgentExecutor.fromAgentAndTools({ agent, tools })
   */
  asLangChainTool(config: LangChainToolConfig = {}) {
    // Dynamic import to avoid hard dependency on langchain
    return {
      name: config.name ?? "ergo_pay",
      description:
        config.description ??
        "Send ERG payments on the Ergo blockchain. Input must be JSON: { to: string, amount: string (e.g. '0.001 ERG'), memo?: string }",
      func: async (input: string): Promise<string> => {
        let parsed: { to?: string; amount?: string; memo?: string };
        try {
          parsed = JSON.parse(input);
        } catch {
          return JSON.stringify({ error: "Invalid JSON input" });
        }

        if (!parsed.to || !parsed.amount) {
          return JSON.stringify({ error: "Required fields: to, amount" });
        }

        try {
          const result = await this.pay(parsed.to, parsed.amount, {
            memo: parsed.memo,
          });
          return JSON.stringify({
            success: true,
            txId: result.txId,
            submitted: result.submitted,
            amount: parsed.amount,
            to: parsed.to,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: msg });
        }
      },
    };
  }

  /**
   * Returns an OpenAI function definition + handler.
   * Pass the definition to the `functions` array in your ChatCompletion call.
   *
   * @example
   * const { definition, handler } = agent.asOpenAIFunction()
   * // Pass definition to OpenAI, call handler when function_call fires
   */
  asOpenAIFunction(config: OpenAIFunctionConfig = {}) {
    const name = config.name ?? "ergo_pay";

    const definition = {
      name,
      description: "Send an ERG payment on the Ergo blockchain",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Receiver Ergo address" },
          amount: {
            type: "string",
            description: 'Amount to send — e.g. "0.001 ERG" or "1000000" (nanoERG)',
          },
          memo: {
            type: "string",
            description: "Optional memo stored on-chain in register R4",
          },
        },
        required: ["to", "amount"],
      },
    } as const;

    const handler = async (args: {
      to: string;
      amount: string;
      memo?: string;
    }) => {
      const result = await this.pay(args.to, args.amount, { memo: args.memo });
      return {
        success: true,
        txId: result.txId ?? null,
        submitted: result.submitted,
      };
    };

    return { definition, handler };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async signAndMaybeSubmit(unsignedTx: EIP12UnsignedTx): Promise<PayResult> {
    if (!this.config.signer) {
      // No signer — return unsigned TX for external signing
      return { unsignedTx, submitted: false };
    }

    const signedTx = await this.config.signer(unsignedTx);
    const txId = await this.network.submitTransaction(signedTx);

    return { unsignedTx, signedTx, txId, submitted: true };
  }
}
