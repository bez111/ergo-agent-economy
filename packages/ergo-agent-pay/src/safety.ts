// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Production Safety Guardrails
//
// Lifecycle operations on mainnet must satisfy *two* gates:
//
//   1. **Box-shape gate.** Either a compiled `scriptErgoTree` is supplied, or
//      the caller explicitly opts into the insecure dev/P2PK mode via
//      `dangerouslyAllowInsecureMainnetP2PK`.
//   2. **Audit gate.** The supplied tree is approved by an `AuditPolicy`
//      (typically backed by `ergo-agent-scripts/AUDITED_ERGOTREES.json`),
//      OR the caller explicitly opts into running an unaudited tree via
//      `dangerouslyAllowUnauditedErgoTree`.
//
// Either gate alone is not enough: a non-empty `scriptErgoTree` could still
// be a stale or attacker-supplied tree. PR #2 closed gate 1; this PR closes
// gate 2 (the A-001 finding from the pre-audit pack).
//
// On testnet both gates are bypassed — testnet stays as a friendly dev env.
// ─────────────────────────────────────────────────────────────────────────────

import type { Network } from "./types.js";
import { ErgoAgentPayError } from "./types.js";

/**
 * Audit-policy callback. Returns `{ ok: true }` to approve, or
 * `{ ok: false, reason }` to reject. The SDK never reads ergo-agent-scripts
 * directly — integrators wire the policy explicitly so the SDK stays
 * decoupled.
 *
 * Typical use:
 * ```ts
 * import { verifyAuditedErgoTree } from "ergo-agent-scripts"
 *
 * new ErgoAgentPay({
 *   ...,
 *   auditPolicy: (tree, name) => {
 *     if (!name) return { ok: false, reason: "audit-policy requires a tree name" }
 *     const v = verifyAuditedErgoTree(name, tree, { requireMainnet: true })
 *     return v.ok ? { ok: true } : { ok: false, reason: v.message ?? v.reason ?? "unaudited" }
 *   },
 * })
 * ```
 */
export type AuditPolicy = (
  treeHex: string,
  name?: string
) => AuditPolicyVerdict | Promise<AuditPolicyVerdict>;

export type AuditPolicyVerdict = { ok: true } | { ok: false; reason: string };

export interface ProductionSafetyArgs {
  /** Operation name shown in the error message. */
  operation: "createReserve" | "issueNote" | "deployTracker";

  /** The active network. */
  network: Network;

  /** Compiled ErgoTree for the box's spending condition, or undefined. */
  scriptErgoTree: string | undefined;

  /**
   * Optional name of the audited predicate this tree is supposed to be
   * (e.g. `"credential_v0"`). When set, the audit policy uses it to look
   * up the canonical tree and compare byte-for-byte.
   */
  scriptName?: string;

  /** Whether the agent has opted into dev-only P2PK behaviour on mainnet. */
  dangerouslyAllowInsecureMainnetP2PK?: boolean;

  /**
   * Whether the agent has opted into running an arbitrary unaudited
   * ergoTree on mainnet. ONLY for integrators who know what they're doing.
   * Without this flag and without an `auditPolicy`, mainnet writes with a
   * `scriptErgoTree` are rejected.
   */
  dangerouslyAllowUnauditedErgoTree?: boolean;

  /** Audit-policy callback. See `AuditPolicy`. */
  auditPolicy?: AuditPolicy;

  /**
   * @deprecated Use `dangerouslyAllowInsecureMainnetP2PK`. Kept for
   * backward compatibility with PR #2; it maps to the same behaviour and
   * emits a single console warning the first time it is observed.
   */
  allowInsecureDevMode?: boolean;
}

let warnedDeprecatedFlag = false;

/**
 * Throws unless the operation is safe to execute under the current config.
 * See module header for the rule chain.
 */
export async function assertProductionSafety(args: ProductionSafetyArgs): Promise<void> {
  const { operation, network, scriptErgoTree, scriptName } = args;

  if (network !== "mainnet") return;

  const allowP2PK =
    args.dangerouslyAllowInsecureMainnetP2PK === true ||
    args.allowInsecureDevMode === true;

  if (args.allowInsecureDevMode === true && !warnedDeprecatedFlag) {
    warnedDeprecatedFlag = true;
    process.stderr?.write?.(
      "⚠ ergo-agent-pay: 'allowInsecureDevMode' is deprecated; use " +
        "'dangerouslyAllowInsecureMainnetP2PK' instead.\n"
    );
  }

  // ── Gate 1: box-shape ─────────────────────────────────────────────────────
  const hasTree = !!scriptErgoTree && scriptErgoTree.length > 0;
  if (!hasTree) {
    if (allowP2PK) return; // explicit insecure opt-in
    throw new ErgoAgentPayError(
      `Refusing to ${operation} on mainnet without a compiled ErgoTree script.\n` +
        `Without scriptErgoTree the resulting box is plain P2PK and any acceptance\n` +
        `predicate stored in R6/R7 is NOT enforced on-chain. Either:\n` +
        `  • supply a compiled scriptErgoTree (recommended), or\n` +
        `  • set dangerouslyAllowInsecureMainnetP2PK: true (testnet/dev only).\n` +
        `See SECURITY.md and SPEC.md.`,
      "INSECURE_MAINNET_MODE"
    );
  }

  // ── Gate 2: audit ────────────────────────────────────────────────────────
  if (args.auditPolicy) {
    let verdict: AuditPolicyVerdict;
    try {
      verdict = await args.auditPolicy(scriptErgoTree!, scriptName);
    } catch (err) {
      // M-004: a buggy auditPolicy must not leak its raw exception. Convert
      // to a typed UNAUDITED_ERGOTREE error so the caller observes the same
      // failure mode as a returned `{ ok: false }`.
      const reason =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      throw new ErgoAgentPayError(
        `Refusing to ${operation} on mainnet — auditPolicy threw while ` +
          `evaluating the supplied ergoTree. Treating as unaudited.\n` +
          `Reason: ${reason}`,
        "UNAUDITED_ERGOTREE",
        err
      );
    }
    if (verdict.ok) return;
    throw new ErgoAgentPayError(
      `Refusing to ${operation} on mainnet — audit policy rejected the supplied ergoTree.\n` +
        `Reason: ${verdict.reason}\n` +
        `Either supply a tree present in your audited manifest as ` +
        `mainnetAllowed, or set dangerouslyAllowUnauditedErgoTree: true ` +
        `(strongly discouraged).`,
      "UNAUDITED_ERGOTREE"
    );
  }

  if (args.dangerouslyAllowUnauditedErgoTree === true) return;

  throw new ErgoAgentPayError(
    `Refusing to ${operation} on mainnet — no auditPolicy is configured.\n` +
      `Mainnet writes require an audited ergoTree. Either:\n` +
      `  • configure auditPolicy on the agent (typically backed by\n` +
      `    \`verifyAuditedErgoTree\` from ergo-agent-scripts), or\n` +
      `  • set dangerouslyAllowUnauditedErgoTree: true (strongly discouraged).\n` +
      `See SECURITY.md.`,
    "UNAUDITED_ERGOTREE"
  );
}
