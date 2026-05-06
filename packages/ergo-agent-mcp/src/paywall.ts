// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-mcp — paywalled tools
//
// Wraps an MCP tool definition so the handler runs only after a payment has
// been verified (and, when a signer is configured, redeemed). Reuses the
// pure-function verifier from `ergo-agent-api` so HTTP and MCP share one
// audit-and-replay path.
//
// Wire-level convention for paywalled MCP tools:
//   * The tool's `inputSchema` MUST contain a `note_box_id` string.
//   * Optionally a `task_output` string (for predicate-bound Notes).
//   * The wrapper synthesises a `NotePaymentRequest` from those fields and
//     calls `processPaymentRequest`.
//   * On success, the wrapped handler receives the verified `Note` info.
//   * On failure, the tool returns an MCP error result with a structured
//     payload — same code shape as the HTTP 402 body so downstream tooling
//     can dispatch on `code` regardless of transport.
// ─────────────────────────────────────────────────────────────────────────────

import {
  processPaymentRequest,
  resolveConfig,
  InMemoryReplayStore,
  type NotePaymentMiddlewareConfig,
  type NotePaymentRequest,
  type NotePaymentAccepted,
  type NotePaymentRejected,
  type NotePaymentRejectionCode,
  type ResolvedConfig,
  type Verdict,
} from "ergo-agent-api";

const DEFAULT_NOTE_FIELD = "note_box_id";
const DEFAULT_TASK_OUTPUT_FIELD = "task_output";

/** Standard MCP tool result. */
export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** Structured metadata accessible via `result._meta`. Optional. */
  _meta?: Record<string, unknown>;
}

/** Caller-provided MCP tool handler — runs once payment verifies. */
export type PaywalledHandler = (
  args: Record<string, unknown>,
  context: { payment: NotePaymentAccepted }
) => Promise<McpToolResult> | McpToolResult;

export interface PaywalledToolConfig {
  /** Tool name as exposed to the MCP client. */
  name: string;
  /** Human-readable description. */
  description: string;
  /**
   * The tool's input schema. The wrapper injects `note_box_id` and
   * `task_output` into `properties` and adds them to `required` (the
   * Note id, anyway) so MCP clients see the payment fields.
   */
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown;
  };
  /** Pricing — same shape `ergo-agent-api` uses. nanoERG. */
  pricing: NotePaymentMiddlewareConfig["pricing"];
  /** SDK instance to drive `checkNote` / `redeemNote`. */
  agent: NotePaymentMiddlewareConfig["agent"];
  /** Inline redemption requires a signer; verify-only otherwise. */
  redeemStrategy?: NotePaymentMiddlewareConfig["redeemStrategy"];
  /** Replay store — defaults to a per-tool `InMemoryReplayStore`. */
  replayStore?: NotePaymentMiddlewareConfig["replayStore"];
  /** Audit hook for accepted payments. */
  onAccepted?: NotePaymentMiddlewareConfig["onAccepted"];
  /** Audit hook for rejected payments. */
  onRejected?: NotePaymentMiddlewareConfig["onRejected"];
  /** Override the args field name carrying the boxId. Default: `note_box_id`. */
  noteField?: string;
  /** Override the args field name carrying the task output. Default: `task_output`. */
  taskOutputField?: string;
  /** The actual tool handler — runs once payment verifies. */
  handler: PaywalledHandler;
}

/** Public shape of a paywalled tool returned by the factory. */
export interface PaywalledTool {
  name: string;
  description: string;
  inputSchema: object;
  /** MCP-compatible handler. Pass tool args; handler returns an MCP result. */
  call(args: Record<string, unknown>): Promise<McpToolResult>;
  /** Internal — exposed for testing / advanced wiring. */
  readonly _config: PaywalledToolConfig;
  /** Internal — exposed for testing. */
  readonly _resolved: ResolvedConfig;
}

/**
 * Build a paywalled MCP tool. The returned object plugs into any MCP server
 * implementation that accepts `{ name, description, inputSchema }` for
 * `tools/list` and routes calls through `tool.call(args)`.
 *
 * @example
 * const summarise = createPaywalledTool({
 *   name: "summarise",
 *   description: "Pay 0.001 ERG to receive a one-line summary of `text`.",
 *   inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
 *   pricing: 1_000_000n,
 *   agent,
 *   handler: async (args, { payment }) => ({
 *     content: [{ type: "text", text: `Summary: ${String(args.text).slice(0, 40)}…` }],
 *     _meta: { box_id: payment.noteBoxId, tx_id: payment.redemption?.txId },
 *   }),
 * })
 */
export function createPaywalledTool(config: PaywalledToolConfig): PaywalledTool {
  const noteField = config.noteField ?? DEFAULT_NOTE_FIELD;
  const taskOutputField = config.taskOutputField ?? DEFAULT_TASK_OUTPUT_FIELD;

  // Inject the payment fields into the tool's input schema. Clients see them.
  const inputSchema = injectPaymentFields(config.inputSchema, noteField, taskOutputField);

  // Resolve once — the audit/payment config doesn't change per call.
  const resolved = resolveConfig({
    agent: config.agent,
    pricing: config.pricing,
    replayStore: config.replayStore ?? new InMemoryReplayStore({ capacity: 10_000 }),
    redeemStrategy: config.redeemStrategy,
    onAccepted: config.onAccepted,
    onRejected: config.onRejected,
    // Header names are unused for MCP, but we set them for parity so the
    // 402-style response payload shape stays consistent.
    noteHeader: noteField,
    taskOutputHeader: taskOutputField,
  });

  const tool: PaywalledTool = {
    name: config.name,
    description: config.description,
    inputSchema,
    _config: config,
    _resolved: resolved,
    async call(args: Record<string, unknown>): Promise<McpToolResult> {
      const noteBoxId = stringField(args, noteField);
      const taskOutput = stringField(args, taskOutputField);

      // Synthesise a NotePaymentRequest. Path is the tool name (so a
      // path-keyed pricing config still works); method is "MCP/CALL".
      const headers: Record<string, string> = {};
      if (noteBoxId !== undefined) headers[noteField] = noteBoxId;
      if (taskOutput !== undefined) headers[taskOutputField] = taskOutput;

      const request: NotePaymentRequest = {
        method: "MCP/CALL",
        path: `/${config.name}`,
        headers,
      };

      let verdict: Verdict;
      try {
        verdict = await processPaymentRequest(resolved, request);
      } catch (err) {
        return errorResult({
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
          tool: config.name,
        });
      }

      if (verdict.kind === "rejected") {
        const event: NotePaymentRejected = {
          request,
          noteBoxId: verdict.noteBoxId,
          reason: verdict.code,
          message: verdict.message,
          price: verdict.price,
          note: verdict.note,
          timestamp: Date.now(),
        };
        if (config.onRejected) {
          // Hook errors must not break the tool flow.
          try {
            await config.onRejected(event);
          } catch {
            /* ignore */
          }
        }
        return errorResult({
          code: verdict.code,
          message: verdict.message,
          tool: config.name,
          required_nano_erg: verdict.price?.toString(),
        });
      }

      const accepted: NotePaymentAccepted = {
        request,
        noteBoxId: verdict.noteBoxId,
        note: verdict.note,
        price: verdict.price,
        redemption: verdict.redemption,
        timestamp: Date.now(),
      };
      if (config.onAccepted) {
        try {
          await config.onAccepted(accepted);
        } catch {
          /* ignore */
        }
      }

      // Strip the payment fields before handing args to the user handler.
      const userArgs: Record<string, unknown> = { ...args };
      delete userArgs[noteField];
      delete userArgs[taskOutputField];

      try {
        return await config.handler(userArgs, { payment: accepted });
      } catch (err) {
        return errorResult({
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
          tool: config.name,
        });
      }
    },
  };

  return tool;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function injectPaymentFields(
  base: PaywalledToolConfig["inputSchema"],
  noteField: string,
  taskOutputField: string
): PaywalledToolConfig["inputSchema"] {
  const properties: Record<string, unknown> = { ...(base.properties ?? {}) };
  if (!(noteField in properties)) {
    properties[noteField] = {
      type: "string",
      description:
        "Box ID of an Ergo Note covering this tool's price. Required.",
    };
  }
  if (!(taskOutputField in properties)) {
    properties[taskOutputField] = {
      type: "string",
      description:
        "Optional task-output bytes for predicate-bound Notes. Required only if the Note carries a task hash in R6.",
    };
  }
  const required = Array.from(new Set([...(base.required ?? []), noteField]));
  return { ...base, properties, required };
}

function stringField(args: Record<string, unknown>, name: string): string | undefined {
  const v = args[name];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function errorResult(payload: {
  code: NotePaymentRejectionCode | "INTERNAL_ERROR";
  message: string;
  tool: string;
  required_nano_erg?: string;
}): McpToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Payment required for tool "${payload.tool}": [${payload.code}] ${payload.message}`,
      },
    ],
    _meta: {
      error_code: payload.code,
      tool: payload.tool,
      ...(payload.required_nano_erg ? { required_nano_erg: payload.required_nano_erg } : {}),
    },
  };
}
