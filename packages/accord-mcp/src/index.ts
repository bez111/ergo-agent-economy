export {
  wrapAccordMcp,
  describeAccordMcpTool,
  injectAccordSchemaFields,
} from "./wrap.js";

export {
  ACCORD_MCP_ERROR_CODES,
  type AccordMcpErrorCode,
} from "./errors.js";

export type {
  AccordMcpToolDefinition,
  McpJsonSchema,
  AccordPaymentProof,
  AccordRailAdapter,
  VerifyPaymentInput,
  VerifyPaymentResult,
  SettleInput,
  AccordVerifierFn,
  VerifierInput,
  AccordMcpHandler,
  AccordMcpWrapperConfig,
  AccordMcpInputArgs,
  AccordMcpResult,
  AccordMcpSuccessResult,
  AccordMcpErrorResult,
} from "./types.js";
