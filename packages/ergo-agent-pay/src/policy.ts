// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Policy Engine
//
// v1 features (unchanged): maxSinglePayment, maxSessionSpend, requireApprovalAbove,
// beforePay/afterPay hooks.
//
// v2 additions: per-recipient caps, recipient allowlist/blocklist, UTC daily
// budget, structured audit log. Every addition is opt-in; an empty config
// behaves exactly like v1.
//
// Decision order in checkBefore:
//   1. recipientBlocklist          — blocklist always wins
//   2. recipientAllowlist          — only listed recipients pass through
//   3. perRecipientCap[to] OR maxSinglePayment
//   4. maxSessionSpend
//   5. dailyBudget                 — UTC-day rolling cap
//   6. requireApprovalAbove        — async gate
//   7. beforePay hook              — final user check
// Every decision (allow OR reject) is forwarded to auditLog if configured.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PolicyConfig,
  PayContext,
  PayResult,
  AuditLogEvent,
  AuditLogFn,
  ErgoAgentPayErrorCode,
} from "./types.js";
import { ErgoAgentPayError } from "./types.js";

export class PolicyEngine {
  private sessionSpend = 0n;
  private dailySpend = 0n;
  private dailyEpochDay = -1; // -1 means "uninitialised"
  private readonly config: PolicyConfig;
  private readonly now: () => number;
  private readonly perRecipientCap: ReadonlyMap<string, bigint>;
  private readonly allowlist: ReadonlySet<string> | null;
  private readonly blocklist: ReadonlySet<string>;

  constructor(config: PolicyConfig = {}) {
    this.config = config;
    this.now = config.now ?? Date.now;
    this.perRecipientCap = normaliseMap(config.perRecipientCap);
    this.allowlist = config.recipientAllowlist
      ? normaliseSet(config.recipientAllowlist)
      : null;
    this.blocklist = config.recipientBlocklist
      ? normaliseSet(config.recipientBlocklist)
      : new Set();
  }

  async checkBefore(ctx: PayContext): Promise<void> {
    try {
      this.evaluateLimits(ctx);
      await this.evaluateApproval(ctx);
      await this.evaluateBeforeHook(ctx);
    } catch (err) {
      if (err instanceof ErgoAgentPayError) {
        await this.audit({
          kind: "before",
          ctx,
          allowed: false,
          reason: err.message,
          code: err.code,
        });
      }
      throw err;
    }

    await this.audit({ kind: "before", ctx, allowed: true });
  }

  async recordAfter(ctx: PayContext, result: PayResult): Promise<void> {
    this.sessionSpend += ctx.value;
    this.tickDay();
    this.dailySpend += ctx.value;

    if (this.config.afterPay) {
      await this.config.afterPay(ctx, result);
    }
    await this.audit({ kind: "after", ctx, result });
  }

  /** Total nanoERG spent in the current session. */
  get totalSessionSpend(): bigint {
    return this.sessionSpend;
  }

  /** Total nanoERG spent in the current UTC day, post-roll. */
  get totalDailySpend(): bigint {
    this.tickDay();
    return this.dailySpend;
  }

  /** Reset the session counter. Daily counter is unaffected. */
  resetSession(): void {
    this.sessionSpend = 0n;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private evaluateLimits(ctx: PayContext): void {
    if (this.blocklist.has(ctx.to)) {
      throw new ErgoAgentPayError(
        `Recipient ${ctx.to} is on the policy blocklist.`,
        "POLICY_REJECTED"
      );
    }

    if (this.allowlist && !this.allowlist.has(ctx.to)) {
      throw new ErgoAgentPayError(
        `Recipient ${ctx.to} is not in the policy allowlist.`,
        "POLICY_REJECTED"
      );
    }

    const cap = this.perRecipientCap.get(ctx.to) ?? this.config.maxSinglePayment;
    if (cap !== undefined && ctx.value > cap) {
      const scope = this.perRecipientCap.has(ctx.to) ? `for ${ctx.to}` : `single-payment`;
      throw new ErgoAgentPayError(
        `Payment of ${ctx.value} nanoERG exceeds ${scope} limit of ${cap} nanoERG.`,
        "POLICY_REJECTED"
      );
    }

    const projectedSession = this.sessionSpend + ctx.value;
    if (
      this.config.maxSessionSpend !== undefined &&
      projectedSession > this.config.maxSessionSpend
    ) {
      throw new ErgoAgentPayError(
        `Payment would bring session total to ${projectedSession} nanoERG, exceeding limit of ${this.config.maxSessionSpend} nanoERG.`,
        "POLICY_REJECTED"
      );
    }

    if (this.config.dailyBudget !== undefined) {
      this.tickDay();
      const projectedDaily = this.dailySpend + ctx.value;
      if (projectedDaily > this.config.dailyBudget) {
        throw new ErgoAgentPayError(
          `Payment would bring UTC-day total to ${projectedDaily} nanoERG, exceeding daily budget of ${this.config.dailyBudget} nanoERG.`,
          "POLICY_REJECTED"
        );
      }
    }
  }

  private async evaluateApproval(ctx: PayContext): Promise<void> {
    const { requireApprovalAbove, approvalFn } = this.config;
    if (requireApprovalAbove === undefined || ctx.value <= requireApprovalAbove) return;

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

  private async evaluateBeforeHook(ctx: PayContext): Promise<void> {
    if (!this.config.beforePay) return;
    const allowed = await this.config.beforePay(ctx);
    if (!allowed) {
      throw new ErgoAgentPayError(
        `Payment rejected by beforePay policy hook.`,
        "POLICY_REJECTED"
      );
    }
  }

  private tickDay(): void {
    const today = utcEpochDay(this.now());
    if (this.dailyEpochDay !== today) {
      this.dailyEpochDay = today;
      this.dailySpend = 0n;
    }
  }

  private async audit(event: AuditLogEvent): Promise<void> {
    const sink = this.config.auditLog;
    if (!sink) return;
    try {
      await sink(event);
    } catch {
      // intentionally swallowed — audit failure must not break payment flow
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normaliseMap(
  input: PolicyConfig["perRecipientCap"]
): ReadonlyMap<string, bigint> {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

function normaliseSet(
  input: ReadonlyArray<string> | ReadonlySet<string>
): ReadonlySet<string> {
  return input instanceof Set ? input : new Set(input);
}

function utcEpochDay(epochMs: number): number {
  return Math.floor(epochMs / 86_400_000);
}

// Re-export for tests / SDK consumers.
export type { AuditLogEvent, AuditLogFn, ErgoAgentPayErrorCode };
