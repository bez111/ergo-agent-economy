// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/rails-x402 — types
//
// Wraps an x402 facilitator (Coinbase's hosted one, a self-hosted shim, or
// a test stub) into the AccordRailAdapter shape. The buyer's payment is the
// x402 X-PAYMENT header value, opaque to this package — the facilitator
// verifies it and returns a payment_id we use for replay protection.
//
// Settlement is atomic with the response under x402 ("pay_before_response"),
// so we don't carry a separate `settle()` step — the facilitator's `verify`
// either gives us a confirmed payment or it doesn't. We optionally call the
// facilitator's `settle` endpoint for the receipt's tx info, but the rail
// adapter still returns a "settled" Settlement Receipt either way.
// ─────────────────────────────────────────────────────────────────────────────

export type X402Network = "base" | "base-sepolia" | "ethereum" | "sepolia" | string;

/**
 * What the buyer attaches to a paid call. Wire shape:
 *
 * ```json
 * {
 *   "x402_payment_payload": "<base64 of facilitator's PaymentPayload>",
 *   "scheme": "exact"
 * }
 * ```
 *
 * `x402_payment_payload` is opaque — it's whatever the facilitator's
 * `payment_requirements` indicated. For Coinbase's facilitator on Base,
 * this is an EIP-3009 signed transferWithAuthorization. The adapter
 * doesn't decode it; it hands it to the facilitator.
 */
export interface X402PaymentProof {
  /** Opaque payment payload (typically base64-encoded). */
  x402_payment_payload: string;
  /** Optional scheme name; defaults to "exact" per Coinbase's x402 spec. */
  scheme?: string;
}

/**
 * Pluggable x402 facilitator. Production code wires a real HTTP client
 * (Coinbase's facilitator API), tests pass an in-memory stub.
 */
export interface X402Facilitator {
  /** Network the facilitator operates on. Used in Settlement Receipt's tx.network. */
  network: X402Network;

  /**
   * Verify a payment payload against the agreement's price + recipient.
   * Returns either `{ ok: true, payment_id, ... }` (the payment is good
   * and would settle if submitted) or a structured rejection.
   */
  verify(input: X402VerifyInput): Promise<X402VerifyResult>;

  /**
   * Optional: actually submit the payment and return the on-chain tx hash.
   * If omitted, the rail adapter still returns a `settled` Settlement
   * Receipt using the verified payment_id as the tx id (typical for
   * facilitator-flow x402 where verify and submit happen in the same step).
   */
  settle?(input: X402SettleInput): Promise<X402SettleResult>;
}

export interface X402VerifyInput {
  /** Resolved Accord Agreement — gives the facilitator the expected price/currency/recipient. */
  agreement: import("@accord-protocol/core").AccordAgreement;
  /** Raw payment payload from the buyer (base64 / hex / whatever the facilitator expects). */
  paymentPayload: string;
  /** Scheme name from the buyer's proof. Defaults to "exact". */
  scheme?: string;
}

export type X402VerifyResult =
  | {
      ok: true;
      payment_id: string;
      scheme: string;
      payer?: string;
      details?: Record<string, unknown>;
    }
  | { ok: false; code: string; message: string };

export interface X402SettleInput {
  agreement: import("@accord-protocol/core").AccordAgreement;
  paymentPayload: string;
  scheme?: string;
  /** payment_id returned by the matching `verify` call. */
  payment_id: string;
}

export interface X402SettleResult {
  /** EVM tx hash that landed the payment. */
  tx_hash: string;
  /** Block height at which the tx was included. */
  block_height?: number;
}

export interface X402RailAdapterOptions {
  facilitator: X402Facilitator;
  /** Override the `tx.network` field on emitted Settlement Receipts. */
  network?: "mainnet" | "testnet" | "sepolia" | "base-sepolia";
}
