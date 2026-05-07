// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/mcp — types for the wrapper + rail-adapter interface
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AccordAgreement,
  AccordSettlementReceipt,
  AccordVerificationReceipt,
} from "@accord-protocol/core";

/**
 * Subset of an MCP tool definition the wrapper needs. Keep this shape
 * loose so any of the upstream `@modelcontextprotocol/sdk` versions and
 * the various community frameworks can plug in.
 */
export interface AccordMcpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: McpJsonSchema;
}

export interface McpJsonSchema {
  type?: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [k: string]: unknown;
}

/**
 * The opaque per-rail payment proof a buyer sends with a tool call. The
 * wrapper does not inspect it — rail adapters do.
 */
export type AccordPaymentProof = unknown;

/**
 * Pluggable rail. Each rail (Ergo Notes, Base USDC, x402 facilitator)
 * implements this. The MCP wrapper calls `verifyPayment` before the tool
 * runs and (optionally) `settle` after.
 */
export interface AccordRailAdapter {
  rail: string;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  settle?(input: SettleInput): Promise<AccordSettlementReceipt>;
}

export interface VerifyPaymentInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;
  /** Buyer-supplied address for receipt routing. Optional. */
  buyerHint?: string;
}

export type VerifyPaymentResult =
  | { ok: true; rail: string; details?: Record<string, unknown> }
  | { ok: false; rail: string; code: string; message: string };

export interface SettleInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;
  verification?: AccordVerificationReceipt;
}

/**
 * Optional verifier hook. When present and the Agreement requires
 * verification, the wrapper calls this with the Agreement and the seller's
 * raw output, and expects a signed Verification Receipt back.
 */
export type AccordVerifierFn = (
  args: VerifierInput,
) => Promise<AccordVerificationReceipt>;

export interface VerifierInput {
  agreement: AccordAgreement;
  output: unknown;
}

/**
 * The seller-supplied tool handler. Receives the parsed tool args (with
 * the Accord fields stripped) plus the resolved Agreement. Returns the
 * raw output the wrapper will hash + ship to the verifier.
 */
export type AccordMcpHandler<TArgs = Record<string, unknown>, TOut = unknown> = (
  args: TArgs,
  ctx: { agreement: AccordAgreement },
) => Promise<TOut> | TOut;

/**
 * Configuration the seller passes to `wrapAccordMcp(...)`. The result is
 * a function that handles a single tool call and returns either the
 * tool's output (with `_meta.accord_*` annotations) or a structured
 * MCP error.
 */
export interface AccordMcpWrapperConfig<TArgs, TOut> {
  /** Pluggable rail used to verify the buyer's payment proof. */
  rail: AccordRailAdapter;

  /** Optional verifier. Called only if `agreement.verification.required`. */
  verifier?: AccordVerifierFn;

  /** The seller's tool implementation. */
  handler: AccordMcpHandler<TArgs, TOut>;

  /**
   * Resolve an agreement_id to the full AccordAgreement. The wrapper does
   * not assume any storage backend; the caller plugs in their own. Return
   * `undefined` to signal "unknown agreement" — the wrapper turns this
   * into an MCP error with code `ACCORD_UNKNOWN_AGREEMENT`.
   */
  resolveAgreement: (agreement_id: string) => Promise<AccordAgreement | undefined>;
}

export interface AccordMcpInputArgs {
  /** Required. Buyer must reference an Agreement that resolveAgreement() can resolve. */
  accord_agreement_id: string;
  /** Rail-specific payment proof. The rail adapter's verifyPayment() inspects this. */
  accord_payment: AccordPaymentProof;
  /** Optional pre-committed task output. When present, hashed and matched against agreement.task.output_hash. */
  accord_task_output?: unknown;
}

export interface AccordMcpSuccessResult<TOut> {
  isError?: false;
  content: { type: "text"; text: string }[];
  output: TOut;
  _meta: {
    accord_agreement_id: string;
    accord_agreement_hash: string;
    accord_verification_receipt?: AccordVerificationReceipt;
    accord_settlement_receipt?: AccordSettlementReceipt;
  };
}

export interface AccordMcpErrorResult {
  isError: true;
  content: { type: "text"; text: string }[];
  _meta: {
    accord_error_code: string;
    accord_agreement_id?: string;
    [k: string]: unknown;
  };
}

export type AccordMcpResult<TOut> = AccordMcpSuccessResult<TOut> | AccordMcpErrorResult;
