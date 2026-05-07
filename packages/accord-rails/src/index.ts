// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails — canonical AccordRailAdapter interface
//
// The shared rail-adapter interface that @accord-protocol/mcp,
// @accord-protocol/gateway, and the rail-specific @accord-protocol/rails-{ergo,
// base,rosen,x402} packages all agree on. See specs/ACCORD-006-rails.md.
//
// A rail adapter has three responsibilities:
//   1. verifyPayment(...)         — confirm the buyer's payment proof is good
//   2. settle(...)  (optional)    — close out the economic side, return a
//                                   Settlement Receipt
//   3. refund(...)  (optional)    — return funds when the engagement fails
//                                   past the deadline
//
// Rail adapters are pure objects — no global state. The wrapping layer
// (gateway / MCP) supplies replay storage, agreement resolution, and
// receipt persistence. The rail's only job is to talk to its underlying
// payment system.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AccordAgreement,
  AccordSettlementReceipt,
  AccordVerificationReceipt,
} from "@accord-protocol/core";

/** Opaque per-rail payment proof. The rail decides what's inside. */
export type AccordPaymentProof = unknown;

export interface AccordRailAdapter {
  /** Stable rail identifier — matches the AccordRail enum in core. */
  rail: string;

  /** Confirm the buyer's payment proof matches the Agreement. */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  /**
   * Optional. Close out the economic side and return a Settlement Receipt.
   * Wrappers call this best-effort after the seller's handler succeeds — a
   * thrown rejection here MUST NOT roll back the work the buyer received.
   */
  settle?(input: SettleInput): Promise<AccordSettlementReceipt>;

  /**
   * Optional. Return funds to the buyer when the engagement fails past the
   * deadline (or is rejected by the verifier).
   */
  refund?(input: RefundInput): Promise<AccordSettlementReceipt>;
}

export interface VerifyPaymentInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;
  /** Optional buyer-supplied address for receipt routing. */
  buyerHint?: string;
}

export type VerifyPaymentResult =
  | {
      ok: true;
      rail: string;
      /**
       * Stable per-payment id used for replay protection. Wrappers reject
       * a call whose payment_id was already claimed in the past TTL window.
       *
       * For each rail:
       *   ergo  → Note box id
       *   rosen → Note box id (rsUSDT/rsUSDC/rsBTC)
       *   base  → Solidity tx hash
       *   x402  → facilitator-issued payment proof id
       */
      payment_id: string;
      /** Optional rail-specific bag of debugging data. */
      details?: Record<string, unknown>;
    }
  | {
      ok: false;
      rail: string;
      /** Rail-defined error code. e.g. INSUFFICIENT_VALUE, NOT_CONFIRMED. */
      code: string;
      message: string;
    };

export interface SettleInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;
  /** When verification was required, the receipt that authorised settlement. */
  verification?: AccordVerificationReceipt;
}

export interface RefundInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;
  /** Why the refund was triggered (e.g. "deadline_exceeded", "verification_rejected"). */
  reason: string;
}
