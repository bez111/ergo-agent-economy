// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Production Safety Guardrails
//
// The lifecycle builders accept an optional `scriptErgoTree`. Without one, the
// resulting box is a plain P2PK at the deployer/recipient address — fine for
// testnet experiments, dangerous on mainnet because the on-chain predicate
// stored in R5/R6/R7 is never evaluated. These helpers refuse that combination
// on mainnet unless the caller has explicitly opted into dev mode.
// ─────────────────────────────────────────────────────────────────────────────

import type { Network } from "./types.js";
import { ErgoAgentPayError } from "./types.js";

export interface ProductionSafetyArgs {
  /** Operation name shown in the error message. */
  operation: "createReserve" | "issueNote" | "deployTracker";

  /** The active network. */
  network: Network;

  /** Compiled ErgoTree for the box's spending condition, or undefined. */
  scriptErgoTree: string | undefined;

  /** Whether the agent has opted into dev-only behaviour on mainnet. */
  allowInsecureDevMode: boolean | undefined;
}

/**
 * Throws unless the operation is safe to execute under the current config.
 *
 * Rules:
 *   - testnet: always allowed.
 *   - mainnet + scriptErgoTree set: allowed (real on-chain enforcement).
 *   - mainnet + no scriptErgoTree + allowInsecureDevMode=true: allowed
 *     (caller has explicitly accepted P2PK semantics).
 *   - mainnet + no scriptErgoTree + no opt-in: rejected.
 */
export function assertProductionSafety(args: ProductionSafetyArgs): void {
  const { operation, network, scriptErgoTree, allowInsecureDevMode } = args;

  if (network !== "mainnet") return;
  if (scriptErgoTree && scriptErgoTree.length > 0) return;
  if (allowInsecureDevMode === true) return;

  throw new ErgoAgentPayError(
    `Refusing to ${operation} on mainnet without a compiled ErgoTree script.\n` +
      `Without scriptErgoTree the resulting box is plain P2PK and any acceptance\n` +
      `predicate stored in R6/R7 is NOT enforced on-chain. Either:\n` +
      `  • compile a ChainCash / Basis script and pass it as scriptErgoTree, or\n` +
      `  • set allowInsecureDevMode: true on the agent config (testnet/dev only).\n` +
      `See SPEC.md for the full Reserve/Note/Tracker v0 spec.`,
    "INSECURE_MAINNET_MODE"
  );
}
