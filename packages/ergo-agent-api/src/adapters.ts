// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-api — framework adapters
//
// `createNotePaymentMiddleware` returns an Express/Connect-compatible
// `(req, res, next)` function. It does no Express-specific imports — the
// adapter only relies on the duck-typed shape of node's IncomingMessage and
// ServerResponse, so it also works with Connect, polka, or anything that
// follows the same contract.
//
// On a verified, paid request the middleware:
//   1. Calls `processPaymentRequest`.
//   2. On accepted: attaches `req.notePayment` and calls `next()`.
//   3. On rejected: writes a 402 (or 4xx) response and does NOT call `next()`.
//
// The accepted handler reads `req.notePayment` for boxId, value, expiry etc.
// ─────────────────────────────────────────────────────────────────────────────

import { processPaymentRequest, resolveConfig } from "./handler.js";
import type {
  NotePaymentMiddlewareConfig,
  NotePaymentRequest,
  NotePaymentResponseBody,
  NotePaymentRejectionCode,
  NotePaymentAccepted,
  NotePaymentRejected,
} from "./types.js";

// Minimal Node http types — we duck-type against them to avoid a hard
// Express dependency (Express IncomingMessage extends node's, so this is
// compatible).
interface IncomingLike {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Field set by the middleware on accepted requests. */
  notePayment?: NotePaymentAccepted;
}

interface ResponseLike {
  setHeader(name: string, value: string): unknown;
  statusCode: number;
  end(chunk?: string | Uint8Array): unknown;
  /** Express adds .status() / .json() — we use only setHeader/statusCode/end so we work everywhere. */
}

type Next = (err?: unknown) => void;

const REJECTION_STATUS: Record<NotePaymentRejectionCode, number> = {
  PAYMENT_REQUIRED: 402,
  NOTE_NOT_FOUND: 402,
  NOTE_EXPIRED: 402,
  NOTE_INVALID: 402,
  VALUE_TOO_LOW: 402,
  REPLAY: 409,
  REDEMPTION_FAILED: 502,
  INTERNAL_ERROR: 500,
};

export function createNotePaymentMiddleware(config: NotePaymentMiddlewareConfig) {
  const resolved = resolveConfig(config);

  return async function middleware(
    req: IncomingLike,
    res: ResponseLike,
    next: Next
  ): Promise<void> {
    const path = pathOf(req.url);
    const method = (req.method ?? "GET").toUpperCase();
    const requestShape: NotePaymentRequest = { headers: req.headers, path, method };

    let verdict;
    try {
      verdict = await processPaymentRequest(resolved, requestShape);
    } catch (err) {
      writeRejected(res, resolved.noteHeader, resolved.taskOutputHeader, {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
      void invokeRejectedHook(config, requestShape, {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (verdict.kind === "rejected") {
      writeRejected(res, resolved.noteHeader, resolved.taskOutputHeader, verdict);
      void invokeRejectedHook(config, requestShape, verdict);
      return;
    }

    req.notePayment = {
      request: requestShape,
      noteBoxId: verdict.noteBoxId,
      note: verdict.note,
      price: verdict.price,
      redemption: verdict.redemption,
      timestamp: Date.now(),
    };

    void invokeAcceptedHook(config, req.notePayment);
    next();
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pathOf(url: string | undefined): string {
  if (!url) return "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function writeRejected(
  res: ResponseLike,
  noteHeader: string,
  taskOutputHeader: string,
  verdict: { code: NotePaymentRejectionCode; message: string; price?: bigint }
): void {
  const body: NotePaymentResponseBody = {
    error: verdict.code,
    message: verdict.message,
    note_header: noteHeader,
    task_output_header: taskOutputHeader,
  };
  if (verdict.price !== undefined) {
    body.required_nano_erg = verdict.price.toString();
    body.required_erg = formatErg(verdict.price);
    res.setHeader("Note-Required", verdict.price.toString());
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("WWW-Authenticate", `NotePayment header=\"${noteHeader}\"`);
  res.statusCode = REJECTION_STATUS[verdict.code];
  res.end(JSON.stringify(body));
}

function formatErg(nano: bigint): string {
  const erg = nano / 1_000_000_000n;
  const frac = nano % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${erg}.${fracStr}` : erg.toString();
}

async function invokeAcceptedHook(
  config: NotePaymentMiddlewareConfig,
  event: NotePaymentAccepted
): Promise<void> {
  if (!config.onAccepted) return;
  try {
    await config.onAccepted(event);
  } catch {
    // hooks must not break payment flow
  }
}

async function invokeRejectedHook(
  config: NotePaymentMiddlewareConfig,
  request: NotePaymentRequest,
  verdict: {
    code: NotePaymentRejectionCode;
    message: string;
    noteBoxId?: string;
    price?: bigint;
  }
): Promise<void> {
  if (!config.onRejected) return;
  const event: NotePaymentRejected = {
    request,
    noteBoxId: verdict.noteBoxId,
    reason: verdict.code,
    message: verdict.message,
    price: verdict.price,
    timestamp: Date.now(),
  };
  try {
    await config.onRejected(event);
  } catch {
    // hooks must not break payment flow
  }
}
