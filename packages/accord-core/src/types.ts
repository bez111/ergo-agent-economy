// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/core — type definitions
//
// Mirrors the v0 schemas in schemas/. Keep these in sync.
// ─────────────────────────────────────────────────────────────────────────────

export type AccordCurrency = "ERG" | "USDC" | "USDT" | "rsUSDT" | "rsUSDC" | "rsBTC";
export type AccordRail = "ergo" | "rosen" | "base" | "x402";

// ── Agreement (ACCORD-001) ──────────────────────────────────────────────────

export interface AccordParty {
  id: string; // (agent|provider|verifier|human)://...
  wallet?: string; // (ergo|eth|base|rosen):...
}

export interface AccordTask {
  kind: string;
  input_ref: string;
  description: string;
  output_schema?: string;
  output_hash?: string;
}

export interface AccordPrice {
  amount: string; // decimal string, never a number
  currency: AccordCurrency;
  decimals: number;
}

export type AccordPaymentMode = "note" | "escrow" | "pay_before_response" | "batchable";

export interface AccordPayment {
  mode: AccordPaymentMode;
  rail: AccordRail;
  reserve_ref?: string; // required when mode === "note"
  deadline: string; // "+N blocks" | "+N seconds" | ISO-8601 UTC
}

export type AccordVerificationMethod = "verifier_receipt" | "onchain_predicate" | "none";

export interface AccordVerification {
  required: boolean;
  method: AccordVerificationMethod;
  verifier?: string;
  predicate?: string;
  evidence_required?: string[];
}

export type AccordSettlementMode = "inline" | "batchable" | "manual";
export type AccordRefundPolicy = "expiry" | "manual" | "none";
export type AccordDisputePolicy = "verifier_panel" | "manual_review" | "none";

export interface AccordSettlementTerms {
  mode: AccordSettlementMode;
  refund_policy: AccordRefundPolicy;
  dispute_policy: AccordDisputePolicy;
}

export type AccordSignatureScheme = "ed25519" | "secp256k1" | "ergo-sigma";

export interface AccordPartySignature {
  by: string;
  scheme: AccordSignatureScheme;
  public_key: string;
  signature: string;
}

export interface AccordAgreement {
  type: "accord.agreement.v0";
  version: "v0";
  agreement_id: string;
  created_at: string;
  buyer: AccordParty;
  seller: AccordParty;
  task: AccordTask;
  price: AccordPrice;
  payment: AccordPayment;
  verification: AccordVerification;
  settlement: AccordSettlementTerms;
  metadata?: Record<string, unknown>;
  signatures?: AccordPartySignature[];
}

// ── Verification Receipt (ACCORD-002) ───────────────────────────────────────

export type AccordVerificationResult = "accepted" | "rejected" | "partial" | "disputed";
export type AccordCheckResult = "pass" | "fail" | "skip" | "inconclusive";

export interface AccordCheck {
  name: string;
  result: AccordCheckResult;
  detail?: string;
}

export interface AccordEvidence {
  output_hash: string;
  output_ref?: string;
  schema?: string;
}

export interface AccordSignature {
  scheme: AccordSignatureScheme;
  public_key: string;
  signature: string;
}

export interface AccordVerificationReceipt {
  type: "accord.verification_receipt.v0";
  version: "v0";
  receipt_id: string;
  agreement_id: string;
  agreement_hash: string;
  verifier: AccordParty;
  result: AccordVerificationResult;
  evidence: AccordEvidence;
  checks?: AccordCheck[];
  created_at: string;
  signature: AccordSignature;
}

// ── Settlement Receipt (ACCORD-003) ─────────────────────────────────────────

export type AccordSettlementMode2 =
  | "note_redeemed"
  | "reserve_refunded"
  | "batch_settled"
  | "redeemed"
  | "refund_expired"
  | "paid_before_response";

export type AccordSettlementStatus =
  | "settled"
  | "partial"
  | "refunded"
  | "failed"
  | "pending";

export interface AccordTx {
  network: "mainnet" | "testnet" | "sepolia" | "base-sepolia";
  tx_id: string;
  box_id?: string;
  block_height?: number;
  confirmations?: number;
  proof?: string;
}

export interface AccordSettlementSignature extends AccordSignature {
  signer_role?: "gateway" | "provider" | "verifier" | "registry";
}

export interface AccordSettlementReceipt {
  type: "accord.settlement_receipt.v0";
  version: "v0";
  settlement_id: string;
  agreement_id: string;
  agreement_hash: string;
  verification_receipts?: string[];
  rail: AccordRail;
  mode: AccordSettlementMode2;
  status: AccordSettlementStatus;
  amount: string;
  currency: AccordCurrency;
  decimals: number;
  tx: AccordTx;
  signature?: AccordSettlementSignature;
  created_at: string;
}

// ── Per-rail mode allow-list ────────────────────────────────────────────────

export const RAIL_MODE_ALLOWLIST: Record<AccordRail, AccordSettlementMode2[]> = {
  ergo: ["note_redeemed", "reserve_refunded", "batch_settled"],
  rosen: ["note_redeemed", "reserve_refunded", "batch_settled"],
  base: ["redeemed", "refund_expired"],
  x402: ["paid_before_response"],
};
