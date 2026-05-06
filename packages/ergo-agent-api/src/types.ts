// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-api — types
// ─────────────────────────────────────────────────────────────────────────────

import type { ErgoAgentPay, NoteInfo } from "ergo-agent-pay";

/**
 * Minimal request shape the handler reads. Compatible with Express/Connect
 * `IncomingMessage` and Fastify; the framework adapters in this package map
 * their native objects to this shape.
 */
export interface NotePaymentRequest {
  /** Lower-cased header map. Express normalises to lower-case already. */
  headers: Record<string, string | string[] | undefined>;
  /** Path component without query string, e.g. "/api/analyze". */
  path: string;
  /** Upper-case HTTP method. */
  method: string;
}

/**
 * Pricing for a request. nanoERG.
 *
 * - **bigint**           — flat fee for every request the middleware sees.
 * - **Record<path, fee>** — keyed by exact `path`. A `default` key is the
 *                           fallback when no path matches.
 * - **function**         — full custom decision; may be async.
 */
export type Pricing =
  | bigint
  | Record<string, bigint>
  | ((req: NotePaymentRequest) => bigint | Promise<bigint>);

/**
 * Replay-protection store. The middleware claims a Note's boxId before
 * accepting the request, so a Note can only be spent once even if the
 * client sends two parallel requests.
 *
 * Implementations should be atomic: `tryClaim` MUST return `false` for the
 * second concurrent caller. The default in-memory store satisfies this for
 * a single Node process.
 */
export interface ReplayStore {
  /** Returns true iff this is the first claim for `boxId`. */
  tryClaim(boxId: string): Promise<boolean> | boolean;

  /** Optional: release a claim if redemption fails downstream. */
  release?(boxId: string): Promise<void> | void;

  /** Optional: explicit prefix-keyed storage for namespaced deployments. */
  readonly namespace?: string;
}

export interface NotePaymentMiddlewareConfig {
  /**
   * SDK instance with the server's address, network, and (optionally) signer.
   * If `agent.signer` is set and `redeemStrategy === "immediate"`, the
   * middleware redeems the Note as part of the request flow. Otherwise it
   * only verifies and accepts.
   */
  agent: ErgoAgentPay;

  /** Pricing rule, see `Pricing`. */
  pricing: Pricing;

  /**
   * Header name carrying the Note's boxId. Default `x-note-box-id`.
   * Header lookup is case-insensitive.
   */
  noteHeader?: string;

  /**
   * Header name carrying the task output for predicate-bound Notes.
   * Default `x-task-output`. Optional — most flows do not need this.
   */
  taskOutputHeader?: string;

  /** Replay-protection store. Default: in-memory `Set<string>`. */
  replayStore?: ReplayStore;

  /**
   * `"immediate"`  — verify + redeem in the request flow (requires signer).
   * `"verify-only"` — verify but do not redeem (caller redeems out of band).
   *
   * Default: `"verify-only"` if the agent has no signer, `"immediate"` otherwise.
   */
  redeemStrategy?: "immediate" | "verify-only";

  /**
   * Address to redeem to. Defaults to the agent's own address.
   */
  receiverAddress?: string;

  /** Called after a request is accepted (and, where applicable, redeemed). */
  onAccepted?: (event: NotePaymentAccepted) => void | Promise<void>;

  /** Called when the middleware rejects a request. */
  onRejected?: (event: NotePaymentRejected) => void | Promise<void>;
}

export interface NotePaymentAccepted {
  request: NotePaymentRequest;
  noteBoxId: string;
  note: NoteInfo;
  /** nanoERG charged. */
  price: bigint;
  /** Result of redemption — undefined when `redeemStrategy === "verify-only"`. */
  redemption?: { txId?: string; submitted: boolean };
  timestamp: number;
}

export interface NotePaymentRejected {
  request: NotePaymentRequest;
  noteBoxId: string | undefined;
  reason: NotePaymentRejectionCode;
  message: string;
  /** nanoERG required, when known. */
  price?: bigint;
  /** The verified Note, if verification got that far. */
  note?: NoteInfo;
  timestamp: number;
}

export type NotePaymentRejectionCode =
  | "PAYMENT_REQUIRED"      // missing or empty Note header
  | "NOTE_NOT_FOUND"        // boxId did not resolve on-chain
  | "NOTE_EXPIRED"          // current height >= R5 expiry
  | "NOTE_INVALID"          // malformed registers, etc.
  | "VALUE_TOO_LOW"         // Note value < required price
  | "REPLAY"                // boxId was already claimed by this middleware
  | "REDEMPTION_FAILED"     // signer or submit threw
  | "INTERNAL_ERROR";

/**
 * Standard 402 response payload returned to clients on rejection.
 * The middleware also sets `Note-Required: <nanoErg>` and
 * `WWW-Authenticate: NotePayment` headers.
 */
export interface NotePaymentResponseBody {
  error: NotePaymentRejectionCode;
  message: string;
  required_nano_erg?: string;
  required_erg?: string;
  note_header: string;
  task_output_header: string;
}
