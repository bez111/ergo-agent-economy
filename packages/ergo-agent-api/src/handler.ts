// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-api — payment-verification handler
//
// `processPaymentRequest` is a pure function: it takes a request shape and
// the middleware config, returns a verdict object. Framework adapters (the
// Express middleware in adapters.ts) call this and translate the verdict
// into HTTP responses. Tests instantiate it directly without spinning up a
// server.
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPayError } from "ergo-agent-pay";
import type { NoteInfo } from "ergo-agent-pay";
import { InMemoryReplayStore } from "./replay.js";
import type {
  NotePaymentMiddlewareConfig,
  NotePaymentRequest,
  NotePaymentRejectionCode,
  Pricing,
  ReplayStore,
} from "./types.js";

const DEFAULT_NOTE_HEADER = "x-note-box-id";
const DEFAULT_TASK_OUTPUT_HEADER = "x-task-output";

/** Internal verdict — the adapter translates this into an HTTP response. */
export type Verdict =
  | {
      kind: "accepted";
      noteBoxId: string;
      note: NoteInfo;
      price: bigint;
      redemption?: { txId?: string; submitted: boolean };
    }
  | {
      kind: "rejected";
      code: NotePaymentRejectionCode;
      message: string;
      noteBoxId?: string;
      note?: NoteInfo;
      price?: bigint;
    };

/**
 * Resolve config defaults once. Held by the framework adapter.
 */
export interface ResolvedConfig {
  config: NotePaymentMiddlewareConfig;
  noteHeader: string;
  taskOutputHeader: string;
  replayStore: ReplayStore;
  redeemStrategy: "immediate" | "verify-only";
  receiverAddress: string | undefined;
}

export function resolveConfig(config: NotePaymentMiddlewareConfig): ResolvedConfig {
  const noteHeader = (config.noteHeader ?? DEFAULT_NOTE_HEADER).toLowerCase();
  const taskOutputHeader = (config.taskOutputHeader ?? DEFAULT_TASK_OUTPUT_HEADER).toLowerCase();
  const replayStore = config.replayStore ?? new InMemoryReplayStore({ capacity: 10_000 });
  const redeemStrategy =
    config.redeemStrategy ??
    // Auto: redeem if the SDK has a signer attached, otherwise verify-only.
    ((config.agent as unknown as { config?: { signer?: unknown } }).config?.signer
      ? "immediate"
      : "verify-only");
  return {
    config,
    noteHeader,
    taskOutputHeader,
    replayStore,
    redeemStrategy,
    receiverAddress: config.receiverAddress,
  };
}

export async function processPaymentRequest(
  resolved: ResolvedConfig,
  req: NotePaymentRequest
): Promise<Verdict> {
  const { config, noteHeader, taskOutputHeader, replayStore, redeemStrategy } = resolved;

  const noteBoxIdRaw = readHeader(req.headers, noteHeader);
  if (!noteBoxIdRaw) {
    return {
      kind: "rejected",
      code: "PAYMENT_REQUIRED",
      message: `Provide a Note box ID in the ${noteHeader} header.`,
      price: await pricingFor(config.pricing, req).catch(() => undefined),
    };
  }

  const noteBoxId = noteBoxIdRaw.trim();
  if (!noteBoxId) {
    return {
      kind: "rejected",
      code: "PAYMENT_REQUIRED",
      message: `${noteHeader} header was empty.`,
    };
  }

  const taskOutput = readHeader(req.headers, taskOutputHeader);

  let price: bigint;
  try {
    price = await pricingFor(config.pricing, req);
  } catch (err) {
    return {
      kind: "rejected",
      code: "INTERNAL_ERROR",
      message: `Pricing function threw: ${describe(err)}`,
      noteBoxId,
    };
  }

  // Replay protection: claim the boxId before we touch the network.
  // If redemption fails we release it so the client can retry.
  const claimed = await replayStore.tryClaim(noteBoxId);
  if (!claimed) {
    return {
      kind: "rejected",
      code: "REPLAY",
      message: `Note ${noteBoxId} was already claimed by this server.`,
      noteBoxId,
      price,
    };
  }

  let note: NoteInfo;
  try {
    note = await config.agent.checkNote(noteBoxId);
  } catch (err) {
    await replayStore.release?.(noteBoxId);
    if (err instanceof ErgoAgentPayError && err.code === "BOX_NOT_FOUND") {
      return {
        kind: "rejected",
        code: "NOTE_NOT_FOUND",
        message: err.message,
        noteBoxId,
        price,
      };
    }
    return {
      kind: "rejected",
      code: "INTERNAL_ERROR",
      message: `Failed to fetch Note: ${describe(err)}`,
      noteBoxId,
      price,
    };
  }

  if (note.isExpired) {
    await replayStore.release?.(noteBoxId);
    return {
      kind: "rejected",
      code: "NOTE_EXPIRED",
      message: `Note expired at block ${note.expiryBlock} (current: ${note.currentBlock}).`,
      noteBoxId,
      note,
      price,
    };
  }

  if (note.value < price) {
    await replayStore.release?.(noteBoxId);
    return {
      kind: "rejected",
      code: "VALUE_TOO_LOW",
      message: `Note value ${note.value} nanoERG is below required price ${price} nanoERG.`,
      noteBoxId,
      note,
      price,
    };
  }

  if (redeemStrategy === "verify-only") {
    return { kind: "accepted", noteBoxId, note, price };
  }

  try {
    const result = await config.agent.redeemNote({
      noteBoxId,
      taskOutput,
      receiverAddress: resolved.receiverAddress,
    });
    return {
      kind: "accepted",
      noteBoxId,
      note,
      price,
      redemption: { txId: result.txId, submitted: result.submitted },
    };
  } catch (err) {
    await replayStore.release?.(noteBoxId);
    return {
      kind: "rejected",
      code: "REDEMPTION_FAILED",
      message: `Redemption failed: ${describe(err)}`,
      noteBoxId,
      note,
      price,
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function pricingFor(pricing: Pricing, req: NotePaymentRequest): Promise<bigint> {
  if (typeof pricing === "bigint") return pricing;
  if (typeof pricing === "function") return await pricing(req);
  const exact = pricing[req.path];
  if (exact !== undefined) return exact;
  const fallback = pricing["default"];
  if (fallback !== undefined) return fallback;
  throw new Error(
    `No price configured for path "${req.path}" and no "default" fallback.`
  );
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) return Array.isArray(direct) ? direct[0] : direct;
  // Express normalises to lower case but we accept any case.
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const v = headers[key];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
