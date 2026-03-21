// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Public API
// ─────────────────────────────────────────────────────────────────────────────

export { ErgoAgentPay } from "./ErgoAgentPay.js";

export {
  computeTaskHash,
  computeTaskHashAsync,
  resolveDeadline,
  validateTaskHash,
  TASK_HASH_PREDICATE_SCRIPT,
  CREDENTIAL_PREDICATE_SCRIPT,
} from "./predicates.js";

export { parseAmount } from "./transactions.js";

export type {
  ErgoAgentPayConfig,
  Network,
  PayOptions,
  PayResult,
  NoteOptions,
  NoteResult,
  PolicyConfig,
  BeforePayHook,
  AfterPayHook,
  ApprovalFn,
  PayContext,
  SignerFn,
  LangChainToolConfig,
  OpenAIFunctionConfig,
  EIP12UnsignedTx,
  SignedTx,
} from "./types.js";

export { ErgoAgentPayError } from "./types.js";
export type { ErgoAgentPayErrorCode } from "./types.js";

// ── Lifecycle types ────────────────────────────────────────────────────────────
export type {
  NoteInfo,
  ReserveConfig,
  ReserveResult,
  RedeemOptions,
  RedeemResult,
  BatchSettleOptions,
  BatchSettleResult,
  TrackerConfig,
  TrackerResult,
} from "./types.js";

// ── Lifecycle builders (for advanced / custom signing flows) ──────────────────
export {
  buildCreateReserveTx,
  buildRedeemNoteTx,
  buildBatchSettleTx,
  buildDeployTrackerTx,
  decodeRegisterInt,
  decodeRegisterBytes,
} from "./lifecycle.js";
