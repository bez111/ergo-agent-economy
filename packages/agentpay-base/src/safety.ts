// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — production safety guardrails
//
// Mirrors `ergo-agent-pay/safety.ts`. Mainnet writes require an audit
// policy that approves the deployed contract's runtime bytecode hash;
// without one, the SDK refuses unless `dangerouslyAllowUnauditedContract: true`.
//
// The bytecode hash is what's verifiable on-chain — the source can change,
// but a deployed contract's runtime bytecode is immutable. The audit
// manifest commits to specific hashes per network.
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, type Hex, type PublicClient, type Address } from "viem";
import { BaseAgentPayError } from "./types.js";
import type { AuditPolicy, BaseNetwork } from "./types.js";

export interface ProductionSafetyArgs {
  operation: "topUp" | "withdraw" | "issueNote" | "redeemNote" | "refundExpired";
  network: BaseNetwork;
  reserveContract: Address;
  publicClient: PublicClient;
  auditPolicy?: AuditPolicy;
  dangerouslyAllowUnauditedContract?: boolean;
}

/**
 * Throws unless the operation is safe. Rules:
 *   - testnet (`base-sepolia`): always allowed.
 *   - mainnet (`base`) + auditPolicy: policy decides.
 *   - mainnet + dangerouslyAllowUnauditedContract=true: allowed (loud opt-in).
 *   - mainnet + neither: rejected with UNAUDITED_CONTRACT.
 */
export async function assertProductionSafety(args: ProductionSafetyArgs): Promise<void> {
  if (args.network !== "base") return;

  if (args.auditPolicy) {
    const codeHash = await fetchBytecodeHash(args.publicClient, args.reserveContract);
    let verdict;
    try {
      verdict = await args.auditPolicy(codeHash, args.network);
    } catch (err) {
      throw new BaseAgentPayError(
        `Refusing to ${args.operation} on Base mainnet — auditPolicy threw. ` +
          `Treating as unaudited.\nReason: ${err instanceof Error ? err.message : String(err)}`,
        "UNAUDITED_CONTRACT",
        err
      );
    }
    if (verdict.ok) return;
    throw new BaseAgentPayError(
      `Refusing to ${args.operation} on Base mainnet — audit policy rejected the contract.\n` +
        `Reason: ${verdict.reason}\n` +
        `Either supply a contract present in your audited manifest as ` +
        `mainnetAllowed, or set dangerouslyAllowUnauditedContract: true ` +
        `(strongly discouraged).`,
      "UNAUDITED_CONTRACT"
    );
  }

  if (args.dangerouslyAllowUnauditedContract === true) return;

  throw new BaseAgentPayError(
    `Refusing to ${args.operation} on Base mainnet — no auditPolicy is configured.\n` +
      `Mainnet writes require an audited contract bytecode hash. Either:\n` +
      `  • configure auditPolicy on the agent (typically backed by\n` +
      `    \`verifyAuditedContract\` from agentpay-base), or\n` +
      `  • set dangerouslyAllowUnauditedContract: true (strongly discouraged).`,
    "UNAUDITED_CONTRACT"
  );
}

/** Fetch the runtime bytecode at `address` and return keccak256 of those bytes. */
export async function fetchBytecodeHash(
  client: PublicClient,
  address: Address
): Promise<Hex> {
  const code = await client.getBytecode({ address });
  if (!code || code === "0x") {
    throw new BaseAgentPayError(
      `No bytecode at ${address} on the active network — contract not deployed?`,
      "UNAUDITED_CONTRACT"
    );
  }
  return keccak256(code);
}
