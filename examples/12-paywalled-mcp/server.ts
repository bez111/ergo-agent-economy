// ─────────────────────────────────────────────────────────────────────────────
// 12 — Paywalled MCP server
//
// One paywalled tool (`summarise`) and one free tool (`agent_address`).
// Boots a stdio-MCP server that any compatible host can connect to.
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ErgoAgentPay } from "ergo-agent-pay";
import { createPaywalledTool, type McpToolResult } from "ergo-agent-mcp/paywall";

const SERVER_ADDRESS = requireEnv("ERGO_ADDRESS");

const agent = new ErgoAgentPay({
  address: SERVER_ADDRESS,
  network: "testnet",
  signer: makeHttpSigner(process.env.EIP12_SIGNER_URL),
});

// ── Paywalled tool ──────────────────────────────────────────────────────────

const summarise = createPaywalledTool({
  name: "summarise",
  description:
    "Pay 0.001 ERG to receive a one-line summary of `text`. Reject test: provide a Note " +
    "boxId in `note_box_id` and (for predicate-bound Notes) the original task output in `task_output`.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to summarise (max 4000 chars)." },
    },
    required: ["text"],
    additionalProperties: false,
  },
  pricing: 1_000_000n, // 0.001 ERG
  agent,
  redeemStrategy: "immediate",
  onAccepted: (event) => {
    process.stderr.write(
      `[paid] ${event.request.path} boxId=${event.noteBoxId} ` +
        `tx=${event.redemption?.txId ?? "verify-only"}\n`
    );
  },
  onRejected: (event) => {
    process.stderr.write(`[refused] ${event.reason}: ${event.message}\n`);
  },
  handler: (args) => {
    const text = String(args["text"] ?? "");
    const summary =
      text.length <= 80
        ? text
        : text.slice(0, 77).replace(/\s+\S*$/, "") + "…";
    return {
      content: [{ type: "text", text: `Summary: ${summary}` }],
    };
  },
});

// ── Free tool — for parity with how MCP servers normally look ──────────────

const FREE_TOOLS: Array<{ name: string; description: string; inputSchema: object }> = [
  {
    name: "agent_address",
    description: "Return the Ergo address this paywalled MCP server operates from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function callFree(name: string): Promise<McpToolResult> {
  switch (name) {
    case "agent_address":
      return { content: [{ type: "text", text: SERVER_ADDRESS }] };
    default:
      return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
}

// ── MCP wiring ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "ergo-paywalled-demo", version: "0.3.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: summarise.name, description: summarise.description, inputSchema: summarise.inputSchema },
    ...FREE_TOOLS,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  if (name === summarise.name) {
    return summarise.call(args);
  }
  return callFree(name);
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(
  `paywalled MCP server up — agent=${SERVER_ADDRESS} (testnet) — paywalled tool: summarise (0.001 ERG/call)\n`
);

// ── helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`environment variable ${name} is required`);
  return v;
}

function makeHttpSigner(url: string | undefined) {
  if (!url) return undefined;
  return async (unsignedTx: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: unsignedTx }),
    });
    if (!res.ok) throw new Error(`signer ${url} returned ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
}
