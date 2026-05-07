// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails/mock — deterministic, in-memory rail adapter
//
// Test/demo helper. Behaves like a real rail but keeps no chain state.
// Useful for:
//   * Unit tests that exercise the gateway / MCP wrapper without standing up
//     an Ergo node or a Base RPC.
//   * Examples that show the Accord flow end-to-end without payment side
//     effects.
//   * Conformance fixtures (PR-017+).
//
// What it does:
//   * verifyPayment: derives `payment_id = blake2b256(payment-canonical-json)`
//     and accepts any payment whose declared `value` ≥ agreement.price.amount.
//   * settle: emits a v0 Settlement Receipt with rail="ergo",
//     mode="note_redeemed", status="settled" (configurable).
//   * refund: emits a v0 Settlement Receipt with status="refunded".
//
// Customise via the constructor for failure-injection tests:
//   new MockRailAdapter({ verifyPaymentMode: "always_reject" })
//   new MockRailAdapter({ settleMode: "throw" })
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  type AccordAgreement,
  type AccordSettlementReceipt,
} from "@accord-protocol/core";
import type {
  AccordPaymentProof,
  AccordRailAdapter,
  RefundInput,
  SettleInput,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./index.js";

export interface MockPayment {
  /**
   * Decimal-string value the mock claims was paid. The mock accepts iff
   * `value >= agreement.price.amount`.
   */
  value: string;
  /** Optional payment_id override. Defaults to BLAKE2b-256 of the payment canonical-JSON. */
  payment_id?: string;
}

export interface MockRailOptions {
  /** Default 'ergo' to keep happy-path tests simple. */
  rail?: string;

  /**
   * Behaviour of verifyPayment:
   *   - "honest"        — accept iff payment.value ≥ price.amount  (default)
   *   - "always_accept" — always accept
   *   - "always_reject" — always reject with code INSUFFICIENT_VALUE
   *   - "throw"         — throw a RuntimeError every call
   */
  verifyPaymentMode?: "honest" | "always_accept" | "always_reject" | "throw";

  /**
   * Behaviour of settle / refund:
   *   - "ok"     — return a deterministic receipt  (default)
   *   - "throw"  — throw a RuntimeError
   */
  settleMode?: "ok" | "throw";
}

export class MockRailAdapter implements AccordRailAdapter {
  readonly rail: string;
  private readonly opts: Required<MockRailOptions>;

  constructor(opts: MockRailOptions = {}) {
    this.opts = {
      rail: opts.rail ?? "ergo",
      verifyPaymentMode: opts.verifyPaymentMode ?? "honest",
      settleMode: opts.settleMode ?? "ok",
    };
    this.rail = this.opts.rail;
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (this.opts.verifyPaymentMode === "throw") {
      throw new Error("MockRailAdapter: verifyPayment configured to throw");
    }

    const payment = (input.payment ?? {}) as Partial<MockPayment>;
    const paymentId =
      payment.payment_id ?? "mock-" + accordHashV0(input.payment as AccordPaymentProof).slice(0, 16);

    if (this.opts.verifyPaymentMode === "always_reject") {
      return {
        ok: false,
        rail: this.rail,
        code: "INSUFFICIENT_VALUE",
        message: "MockRailAdapter is in always_reject mode",
      };
    }
    if (this.opts.verifyPaymentMode === "always_accept") {
      return { ok: true, rail: this.rail, payment_id: paymentId };
    }

    // honest mode
    if (typeof payment.value !== "string") {
      return {
        ok: false,
        rail: this.rail,
        code: "MISSING_VALUE",
        message: "mock payment must have a string `value`",
      };
    }
    if (compareDecimal(payment.value, input.agreement.price.amount) < 0) {
      return {
        ok: false,
        rail: this.rail,
        code: "INSUFFICIENT_VALUE",
        message: `payment value ${payment.value} < agreement price ${input.agreement.price.amount}`,
      };
    }
    return {
      ok: true,
      rail: this.rail,
      payment_id: paymentId,
      details: { value: payment.value },
    };
  }

  async settle(input: SettleInput): Promise<AccordSettlementReceipt> {
    if (this.opts.settleMode === "throw") {
      throw new Error("MockRailAdapter: settle configured to throw");
    }
    return this.makeReceipt(input.agreement, "settled", "note_redeemed");
  }

  async refund(input: RefundInput): Promise<AccordSettlementReceipt> {
    if (this.opts.settleMode === "throw") {
      throw new Error("MockRailAdapter: refund configured to throw");
    }
    return this.makeReceipt(input.agreement, "refunded", "reserve_refunded");
  }

  private makeReceipt(
    agreement: AccordAgreement,
    status: "settled" | "refunded",
    mode: "note_redeemed" | "reserve_refunded",
  ): AccordSettlementReceipt {
    const settlementSeed = `${agreement.agreement_id}:${status}`;
    const receipt: AccordSettlementReceipt = {
      type: "accord.settlement_receipt.v0",
      version: "v0",
      settlement_id: "sr_MOCK" + accordHashV0(settlementSeed).slice(0, 22).toUpperCase(),
      agreement_id: agreement.agreement_id,
      agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
      rail: this.opts.rail as AccordSettlementReceipt["rail"],
      mode: mode as AccordSettlementReceipt["mode"],
      status: status as AccordSettlementReceipt["status"],
      amount: agreement.price.amount,
      currency: agreement.price.currency,
      decimals: agreement.price.decimals,
      tx: {
        network: "testnet",
        tx_id: "0x" + accordHashV0("mock-tx:" + settlementSeed),
        box_id: "0x" + accordHashV0("mock-box:" + settlementSeed),
      },
      created_at: nowIsoUtc(),
    };
    return receipt;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function compareDecimal(a: string, b: string): number {
  const [aInt = "0", aFrac = ""] = a.split(".");
  const [bInt = "0", bFrac = ""] = b.split(".");
  const intLen = Math.max(aInt.length, bInt.length);
  const aIp = aInt.padStart(intLen, "0");
  const bIp = bInt.padStart(intLen, "0");
  if (aIp !== bIp) return aIp < bIp ? -1 : 1;
  const fracLen = Math.max(aFrac.length, bFrac.length);
  const aFp = aFrac.padEnd(fracLen, "0");
  const bFp = bFrac.padEnd(fracLen, "0");
  if (aFp === bFp) return 0;
  return aFp < bFp ? -1 : 1;
}

function nowIsoUtc(): string {
  // Drop ms precision; v0 receipts are second-precision per ACCORD-001 §4.
  const d = new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
