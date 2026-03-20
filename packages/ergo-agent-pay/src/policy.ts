// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Policy Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { PolicyConfig, PayContext, PayResult } from "./types.js";
import { ErgoAgentPayError } from "./types.js";

export class PolicyEngine {
  private sessionSpend = 0n;
  private readonly config: PolicyConfig;

  constructor(config: PolicyConfig = {}) {
    this.config = config;
  }

  async checkBefore(ctx: PayContext): Promise<void> {
    const { maxSinglePayment, maxSessionSpend, requireApprovalAbove, approvalFn, beforePay } =
      this.config;

    // ── Hard limits ─────────────────────────────────────────────────────────

    if (maxSinglePayment !== undefined && ctx.value > maxSinglePayment) {
      throw new ErgoAgentPayError(
        `Payment of ${ctx.value} nanoERG exceeds single-payment limit of ${maxSinglePayment} nanoERG.`,
        "POLICY_REJECTED"
      );
    }

    const projectedTotal = this.sessionSpend + ctx.value;
    if (maxSessionSpend !== undefined && projectedTotal > maxSessionSpend) {
      throw new ErgoAgentPayError(
        `Payment would bring session total to ${projectedTotal} nanoERG, exceeding limit of ${maxSessionSpend} nanoERG.`,
        "POLICY_REJECTED"
      );
    }

    // ── Approval gate ────────────────────────────────────────────────────────

    if (requireApprovalAbove !== undefined && ctx.value > requireApprovalAbove) {
      if (!approvalFn) {
        throw new ErgoAgentPayError(
          `Payment of ${ctx.value} nanoERG requires approval (threshold: ${requireApprovalAbove}), but no approvalFn was configured.`,
          "APPROVAL_DENIED"
        );
      }

      const approved = await approvalFn(ctx);
      if (!approved) {
        throw new ErgoAgentPayError(
          `Payment of ${ctx.value} nanoERG was rejected by approval gate.`,
          "APPROVAL_DENIED"
        );
      }
    }

    // ── Custom hook ──────────────────────────────────────────────────────────

    if (beforePay) {
      const allowed = await beforePay(ctx);
      if (!allowed) {
        throw new ErgoAgentPayError(
          `Payment rejected by beforePay policy hook.`,
          "POLICY_REJECTED"
        );
      }
    }
  }

  async recordAfter(ctx: PayContext, result: PayResult): Promise<void> {
    this.sessionSpend += ctx.value;

    if (this.config.afterPay) {
      await this.config.afterPay(ctx, result);
    }
  }

  /** Total nanoERG spent in the current session */
  get totalSessionSpend(): bigint {
    return this.sessionSpend;
  }

  /** Reset session spend counter */
  resetSession(): void {
    this.sessionSpend = 0n;
  }
}
