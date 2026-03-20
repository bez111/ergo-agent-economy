// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Main Class
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ErgoAgentPayConfig,
  PayOptions,
  PayResult,
  NoteOptions,
  NoteResult,
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
