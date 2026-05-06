// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-api — public surface
// ─────────────────────────────────────────────────────────────────────────────

export { createNotePaymentMiddleware } from "./adapters.js";
export { processPaymentRequest, resolveConfig } from "./handler.js";
export type { Verdict, ResolvedConfig } from "./handler.js";
export { InMemoryReplayStore } from "./replay.js";

export type {
  NotePaymentMiddlewareConfig,
  NotePaymentRequest,
  NotePaymentAccepted,
  NotePaymentRejected,
  NotePaymentRejectionCode,
  NotePaymentResponseBody,
  Pricing,
  ReplayStore,
} from "./types.js";
