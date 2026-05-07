// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/gateway — types
//
// Connect/Express-shaped middleware that doesn't import Express. We model
// req / res as the minimal subset we touch so downstream consumers can use
// any framework (Express, Connect, Fastify-via-shim, raw http, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AccordAgreement,
  AccordSettlementReceipt,
  AccordVerificationReceipt,
} from "@accord-protocol/core";
import type { AccordRailAdapter, AccordPaymentProof } from "./rail.js";

/** Connect/Express-style request — only the fields the middleware reads. */
export interface AccordHttpRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  /**
   * Optional pre-parsed JSON body. The middleware NEVER parses bodies
   * itself — sellers wire up their own JSON parser upstream. The body is
   * passed straight through to the seller's handler.
   */
  body?: unknown;
}

/** Connect/Express-style response — only what the middleware writes. */
export interface AccordHttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(payload?: string): void;
}

export type NextFn = (err?: unknown) => void;

/** Connect-style middleware signature. */
export type AccordMiddleware = (
  req: AccordHttpRequest,
  res: AccordHttpResponse,
  next: NextFn,
) => Promise<void> | void;

/**
 * The seller's handler receives the resolved Agreement plus whatever the
 * upstream JSON parser produced as `req.body`. Returning a value sends a
 * 200 with a JSON body; returning undefined leaves the response untouched
 * so the seller can write to `res` directly.
 */
export type AccordHttpHandler<TBody = unknown, TOut = unknown> = (
  req: AccordHttpRequest,
  ctx: { agreement: AccordAgreement; body: TBody },
) => Promise<TOut | void> | TOut | void;

/** Storage for replay protection — see ACCORD-004. */
export interface AccordReplayStore {
  /** Returns true if the (rail, payment_id) pair was claimed in the past TTL. */
  has(rail: string, paymentId: string): Promise<boolean> | boolean;
  /** Records the claim. The store SHOULD enforce a TTL ≥ deadline. */
  put(
    rail: string,
    paymentId: string,
    expiresAtMs: number,
  ): Promise<void> | void;
}

export interface AccordGatewayConfig<TBody, TOut> {
  /** Pluggable rail used to verify the buyer's payment proof. */
  rail: AccordRailAdapter;

  /**
   * Resolve `accord_agreement_id` (from header or query) to the full
   * Agreement object. Return `undefined` to signal "unknown".
   */
  resolveAgreement: (agreement_id: string) => Promise<AccordAgreement | undefined>;

  /**
   * Build the agreement template the gateway returns in its 402 response.
   * Called when the request lacks Accord headers OR when the supplied
   * agreement-id doesn't resolve. The template is what the buyer agent uses
   * to construct an Agreement Object before payment.
   */
  buildAgreementTemplate: (req: AccordHttpRequest) => AgreementTemplate;

  /** The seller's handler. */
  handler: AccordHttpHandler<TBody, TOut>;

  /** Optional replay store. Defaults to an in-process Map; pass Redis-backed for prod. */
  replayStore?: AccordReplayStore;

  /**
   * Optional verifier hook. When the resolved Agreement has
   * `verification.required === true` and a verifier is configured, the
   * gateway calls it with the seller's output and emits the receipt.
   */
  verifier?: (input: {
    agreement: AccordAgreement;
    output: unknown;
  }) => Promise<AccordVerificationReceipt>;
}

/**
 * Agreement template shape returned in 402 responses (ACCORD-004 §5).
 * Lightweight — just enough for the buyer agent to assemble an
 * Agreement Object. Full Agreement validation happens once the buyer
 * makes the paid call.
 */
export interface AgreementTemplate {
  agreement_template: string; // URL or inline-JSON URI
  price: { amount: string; currency: string; decimals?: number };
  accepted_rails: string[];
  verification_required: boolean;
  /**
   * Optional, free-form provider metadata the buyer agent can show to its
   * principal before signing. Kept loose at v0; the conformance suite
   * doesn't check it.
   */
  provider_metadata?: Record<string, unknown>;
}

/** Names of the headers Accord/402 uses on the wire. */
export const ACCORD_HEADERS = {
  agreementId: "x-accord-agreement-id",
  payment: "x-accord-payment",
  taskOutput: "x-accord-task-output",
  versionResponse: "accord-version",
  agreementRequired: "accord-agreement-required",
  agreementTemplate: "accord-agreement-template",
  acceptedRails: "accord-accepted-rails",
  wwwAuthenticate: "www-authenticate",
} as const;

/** Per-request annotations the middleware exposes to the seller's handler via _meta. */
export interface AccordHandlerMeta {
  agreement_id: string;
  agreement_hash: string;
  rail: string;
  verification_receipt?: AccordVerificationReceipt;
  settlement_receipt?: AccordSettlementReceipt;
}

/** Re-export so consumers don't need to know the rail subpath. */
export type { AccordRailAdapter, AccordPaymentProof } from "./rail.js";
