// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — public API
// ─────────────────────────────────────────────────────────────────────────────

export { BaseAgentPay } from "./adapter.js";
export {
  computeTaskHash,
  NO_TASK_HASH,
  asTaskHash,
} from "./encoding.js";
export {
  assertProductionSafety,
  fetchBytecodeHash,
} from "./safety.js";
export type { ProductionSafetyArgs } from "./safety.js";

export { RESERVE_ABI, ERC20_ABI } from "./abi.js";

export {
  BaseAgentPayError,
} from "./types.js";
export type {
  BaseAgentPayConfig,
  BaseAgentPayErrorCode,
  BaseNetwork,
  AuditPolicy,
  AuditPolicyVerdict,
  NoteOptions,
  NoteInfo,
  IssueNoteResult,
  RedeemNoteResult,
} from "./types.js";

export {
  loadAuditedContracts,
  getAuditedContract,
  verifyAuditedContract,
  type AuditedContractEntry,
  type AuditedContractsManifest,
} from "./audited.js";
