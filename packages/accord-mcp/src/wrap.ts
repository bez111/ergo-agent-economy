// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/mcp — wrap an MCP tool handler with Accord paywall
// + verification + settlement.
//
// The wrapper does the following per call:
//
//   1. Pull `accord_agreement_id` / `accord_payment` / `accord_task_output`
//      out of the buyer's tool args. Reject if `agreement_id` is missing.
//   2. Resolve the Agreement via `config.resolveAgreement`. Reject if unknown.
//   3. Run @accord-protocol/core's `validateAgreement`. Reject on any problem.
//   4. Call `rail.verifyPayment({ agreement, payment })`. Reject on failure.
//   5. (Optional) If `accord_task_output` was sent, ensure its
//      `accord_hash_v0` matches `agreement.task.output_hash` if that field
//      was set.
//   6. Run the seller's handler with the *non-Accord* args + the resolved
//      Agreement.
//   7. If `agreement.verification.required` is true:
//        a. Call `config.verifier({ agreement, output })`.
//        b. Run `validateVerificationReceipt(receipt, { agreement })`.
//        c. Reject the call if the receipt's `result === "rejected"`.
//   8. (Optional) Call `rail.settle(...)`. Don't reject the tool call if
//      settle fails post-execution — log it and return both receipts so
//      the buyer can retry settlement out-of-band.
//   9. Return the handler's output, with both receipts (if any) attached
//      under `_meta.accord_*`.
//
// The wrapper returns `AccordMcpResult` — either a success result with
// `output` + `_meta`, or a structured error with `isError: true` and
// `_meta.accord_error_code`. It deliberately does NOT throw on
// rejection — MCP clients are easier to wire when errors flow as result
// values.
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  validateAgreement,
  validateVerificationReceipt,
  type AccordAgreement,
  type AccordSettlementReceipt,
  type AccordVerificationReceipt,
} from "@accord-protocol/core";

import { ACCORD_MCP_ERROR_CODES } from "./errors.js";
import type {
  AccordMcpHandler,
  AccordMcpInputArgs,
  AccordMcpResult,
  AccordMcpToolDefinition,
  AccordMcpWrapperConfig,
  McpJsonSchema,
} from "./types.js";

/** The tool args shape after Accord fields are stripped. */
type StrippedArgs<TArgs> = Omit<TArgs, keyof AccordMcpInputArgs>;

/**
 * Inject `accord_agreement_id`, `accord_payment`, `accord_task_output`
 * into a tool's input schema. Used by sellers that want their MCP tool
 * advertisement to declare the Accord fields up-front.
 */
export function injectAccordSchemaFields(schema: McpJsonSchema | undefined): McpJsonSchema {
  const base: McpJsonSchema =
    schema && schema.type === "object"
      ? { ...schema, properties: { ...(schema.properties ?? {}) } }
      : { type: "object", properties: {} };

  base.properties = {
    accord_agreement_id: {
      type: "string",
      description:
        "ULID-shaped Accord Agreement id (acc_*). The seller's resolveAgreement() must be able to look this up.",
    },
    accord_payment: {
      description:
        "Rail-specific payment proof. Contents are inspected by the seller's rail adapter, not by the wrapper.",
    },
    accord_task_output: {
      description:
        "Optional pre-committed task output. If set, its accord_hash_v0 must match agreement.task.output_hash.",
    },
    ...base.properties,
  };

  base.required = Array.from(
    new Set([...(base.required ?? []), "accord_agreement_id", "accord_payment"]),
  );
  return base;
}

/**
 * Wrap an Accord/MCP tool. Returns a callable that takes the buyer's
 * raw tool args (including the `accord_*` fields) and returns the
 * structured `AccordMcpResult`.
 */
export function wrapAccordMcp<TArgs extends Record<string, unknown>, TOut>(
  config: AccordMcpWrapperConfig<StrippedArgs<TArgs>, TOut>,
): (args: TArgs & AccordMcpInputArgs) => Promise<AccordMcpResult<TOut>> {
  return async function callAccordMcp(rawArgs) {
    // ── 1. Pull the Accord fields ─────────────────────────────────────────
    const { accord_agreement_id, accord_payment, accord_task_output, ...rest } =
      rawArgs as AccordMcpInputArgs & Record<string, unknown>;

    if (!accord_agreement_id || typeof accord_agreement_id !== "string") {
      return mcpError(ACCORD_MCP_ERROR_CODES.MISSING_AGREEMENT_ID, {
        message: "accord_agreement_id is required",
      });
    }
    if (accord_payment === undefined || accord_payment === null) {
      return mcpError(ACCORD_MCP_ERROR_CODES.MISSING_PAYMENT, {
        message: "accord_payment is required",
        accord_agreement_id,
      });
    }

    // ── 2. Resolve the Agreement ──────────────────────────────────────────
    let agreement: AccordAgreement | undefined;
    try {
      agreement = await config.resolveAgreement(accord_agreement_id);
    } catch (err) {
      return mcpError(ACCORD_MCP_ERROR_CODES.UNKNOWN_AGREEMENT, {
        message: `resolveAgreement threw: ${stringifyError(err)}`,
        accord_agreement_id,
      });
    }
    if (!agreement) {
      return mcpError(ACCORD_MCP_ERROR_CODES.UNKNOWN_AGREEMENT, {
        message: `no agreement found for id ${accord_agreement_id}`,
        accord_agreement_id,
      });
    }

    // ── 3. Validate the Agreement ─────────────────────────────────────────
    const v = validateAgreement(agreement);
    if (!v.ok) {
      return mcpError(ACCORD_MCP_ERROR_CODES.AGREEMENT_INVALID, {
        message: `agreement is invalid: ${v.problems.map((p) => p.code + "@" + p.path).join(", ")}`,
        accord_agreement_id,
        problems: v.problems,
      });
    }

    // ── 4. Verify payment with the rail ───────────────────────────────────
    let verification:
      | { ok: true; rail: string; details?: Record<string, unknown> }
      | { ok: false; rail: string; code: string; message: string };
    try {
      verification = await config.rail.verifyPayment({
        agreement,
        payment: accord_payment,
      });
    } catch (err) {
      return mcpError(ACCORD_MCP_ERROR_CODES.RAIL_UNAVAILABLE, {
        message: `rail.verifyPayment threw: ${stringifyError(err)}`,
        rail: config.rail.rail,
        accord_agreement_id,
      });
    }
    if (!verification.ok) {
      return mcpError(ACCORD_MCP_ERROR_CODES.PAYMENT_VERIFICATION_FAILED, {
        message: verification.message,
        rail: verification.rail,
        rail_error_code: verification.code,
        accord_agreement_id,
      });
    }

    // ── 5. Optional pre-committed task-output hash check ──────────────────
    if (accord_task_output !== undefined && agreement.task.output_hash) {
      const got = "blake2b256:0x" + accordHashV0(accord_task_output);
      if (got !== agreement.task.output_hash) {
        return mcpError(ACCORD_MCP_ERROR_CODES.TASK_OUTPUT_HASH_MISMATCH, {
          message: `accord_task_output hash ${got} ≠ agreement.task.output_hash ${agreement.task.output_hash}`,
          accord_agreement_id,
        });
      }
    }

    // ── 6. Run the seller's handler ───────────────────────────────────────
    let output: TOut;
    try {
      output = await config.handler(rest as StrippedArgs<TArgs>, { agreement });
    } catch (err) {
      return mcpError(ACCORD_MCP_ERROR_CODES.HANDLER_THREW, {
        message: stringifyError(err),
        accord_agreement_id,
      });
    }

    // ── 7. Verifier (when required) ───────────────────────────────────────
    let verificationReceipt: AccordVerificationReceipt | undefined;
    if (agreement.verification.required) {
      if (!config.verifier) {
        return mcpError(ACCORD_MCP_ERROR_CODES.VERIFICATION_REQUIRED, {
          message:
            "agreement.verification.required is true but no verifier is configured on the wrapper",
          accord_agreement_id,
        });
      }
      try {
        verificationReceipt = await config.verifier({ agreement, output });
      } catch (err) {
        return mcpError(ACCORD_MCP_ERROR_CODES.VERIFICATION_REJECTED, {
          message: `verifier threw: ${stringifyError(err)}`,
          accord_agreement_id,
        });
      }

      const vrCheck = validateVerificationReceipt(verificationReceipt, { agreement });
      if (!vrCheck.ok) {
        return mcpError(ACCORD_MCP_ERROR_CODES.VERIFICATION_REJECTED, {
          message: `verification receipt is invalid: ${vrCheck.problems.map((p) => p.code).join(", ")}`,
          accord_agreement_id,
          problems: vrCheck.problems,
        });
      }
      if (verificationReceipt.result === "rejected") {
        return mcpError(ACCORD_MCP_ERROR_CODES.VERIFICATION_REJECTED, {
          message: "verifier rejected the seller's output",
          accord_agreement_id,
          accord_verification_receipt: verificationReceipt,
        });
      }
    }

    // ── 8. Settle (best-effort) ───────────────────────────────────────────
    let settlementReceipt: AccordSettlementReceipt | undefined;
    if (config.rail.settle) {
      try {
        settlementReceipt = await config.rail.settle({
          agreement,
          payment: accord_payment,
          verification: verificationReceipt,
        });
      } catch {
        // Settlement failure post-execution does NOT reject the tool call
        // — the buyer already got the work, the receipts can be reconciled
        // out-of-band. The seller's logs should pick this up.
        settlementReceipt = undefined;
      }
    }

    // ── 9. Success ────────────────────────────────────────────────────────
    return {
      content: [
        {
          type: "text",
          text:
            typeof output === "string"
              ? output
              : JSON.stringify(output),
        },
      ],
      output,
      _meta: {
        accord_agreement_id,
        accord_agreement_hash: "blake2b256:0x" + accordHashV0(agreement),
        accord_verification_receipt: verificationReceipt,
        accord_settlement_receipt: settlementReceipt,
      },
    };
  };
}

/** Build an MCP-shaped error result. */
function mcpError(
  code: string,
  meta: { message: string } & Record<string, unknown>,
): AccordMcpResult<never> {
  const { message, ...rest } = meta;
  return {
    isError: true,
    content: [{ type: "text", text: `[${code}] ${message}` }],
    _meta: {
      accord_error_code: code,
      ...rest,
    },
  };
}

/** Best-effort string render of an unknown thrown value. */
function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Helper: build the MCP tool definition with Accord fields injected.
 * Sellers can register this with their MCP server framework directly.
 */
export function describeAccordMcpTool(
  base: AccordMcpToolDefinition,
): AccordMcpToolDefinition {
  return {
    ...base,
    inputSchema: injectAccordSchemaFields(base.inputSchema),
  };
}
