// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-mcp — programmatic surface
//
// `index.ts` is the bin entrypoint (the MCP server with shebang). Library
// consumers — anyone embedding paywall logic in their own MCP server, an
// SDK adapter, or tests — import from this module instead.
// ─────────────────────────────────────────────────────────────────────────────

export {
  createPaywalledTool,
  type PaywalledTool,
  type PaywalledToolConfig,
  type PaywalledHandler,
  type McpToolResult,
} from "./paywall.js";
