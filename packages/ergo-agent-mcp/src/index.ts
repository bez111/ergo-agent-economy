#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-mcp — MCP Server exposing Ergo blockchain tools to AI agents
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  TransactionBuilder,
  OutputBuilder,
  SColl,
  SByte,
} from "@fleet-sdk/core";

// ── Config ─────────────────────────────────────────────────────────────────────

type Network = "mainnet" | "testnet";

const NODE_URLS: Record<Network, string> = {
  mainnet: "https://api.ergoplatform.com",
  testnet: "https://api-testnet.ergoplatform.com",
};

interface ServerConfig {
  address: string;
  network: Network;
  nodeUrl: string;
}

function parseArgs(): ServerConfig {
  const args = process.argv.slice(2);
  let address = process.env["ERGO_ADDRESS"] ?? "";
  let network: Network = "mainnet";
  let nodeUrl = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address" && args[i + 1]) {
      address = args[++i]!;
    } else if (args[i] === "--network" && args[i + 1]) {
      const val = args[++i]!;
      if (val === "testnet" || val === "mainnet") {
        network = val;
      }
    } else if (args[i] === "--node-url" && args[i + 1]) {
      nodeUrl = args[++i]!;
    }
  }

  if (!nodeUrl) {
    nodeUrl = process.env["ERGO_NODE_URL"] ?? NODE_URLS[network];
  }

  return { address, network, nodeUrl };
}

// ── Network helpers ────────────────────────────────────────────────────────────

async function apiGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status} at ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST error ${res.status} at ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Amount parser ──────────────────────────────────────────────────────────────

const NANOERG_PER_ERG = 1_000_000_000n;

function parseAmount(amount: string): bigint {
  const str = amount.trim();

  const ergMatch = str.match(/^([0-9.]+)\s*ERG?$/i);
  if (ergMatch && ergMatch[1]) {
    const [whole, frac = ""] = ergMatch[1].split(".");
    const fracPadded = frac.padEnd(9, "0").slice(0, 9);
    return BigInt(whole ?? "0") * NANOERG_PER_ERG + BigInt(fracPadded);
  }

  if (/^\d+$/.test(str)) return BigInt(str);

  throw new Error(`Invalid amount: "${amount}". Use nanoERG (integer) or ERG string like "0.005 ERG".`);
}

function nanoErgToErg(nano: bigint | string | number): string {
  const n = BigInt(nano);
  const whole = n / NANOERG_PER_ERG;
  const frac = n % NANOERG_PER_ERG;
  return `${whole}.${frac.toString().padStart(9, "0")} ERG`;
}

// ── Register decoding ──────────────────────────────────────────────────────────

/**
 * Decode SInt register (04 prefix, zigzag encoded).
 * Returns null if the hex does not match expected format.
 */
function decodeSInt(hex: string): number | null {
  if (!hex.startsWith("04")) return null;
  const bytes = hex.slice(2);
  if (bytes.length === 0) return null;

  // Read first VLQ-encoded zigzag value
  let result = 0;
  let shift = 0;
  let i = 0;
  while (i < bytes.length / 2) {
    const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    result |= (byte & 0x7f) << shift;
    shift += 7;
    i++;
    if ((byte & 0x80) === 0) break;
  }

  // Zigzag decode
  return (result >>> 1) ^ -(result & 1);
}

/**
 * Decode SColl[SByte] register (0e prefix + VLQ length + bytes).
 * Returns hex string of the byte payload, or null if format mismatch.
 */
function decodeSCollBytes(hex: string): string | null {
  if (!hex.startsWith("0e")) return null;
  const rest = hex.slice(2);
  if (rest.length < 2) return null;

  // Read VLQ length
  let length = 0;
  let shift = 0;
  let i = 0;
  while (i < rest.length / 2) {
    const byte = parseInt(rest.slice(i * 2, i * 2 + 2), 16);
    length |= (byte & 0x7f) << shift;
    shift += 7;
    i++;
    if ((byte & 0x80) === 0) break;
  }

  const payload = rest.slice(i * 2);
  if (payload.length !== length * 2) return null;
  return payload;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function encodeToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Tool result helpers ────────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${text}` }], isError: true };
}

// ── Tool implementations ───────────────────────────────────────────────────────

async function ergoGetBalance(
  config: ServerConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const address = (params["address"] as string | undefined) || config.address;
  if (!address) {
    return err("No address provided and no agent address configured. Pass --address when starting the server or include 'address' in your request.");
  }

  const data = await apiGet<{ confirmed: { nanoErgs: string | number } }>(
    config.nodeUrl,
    `/api/v1/addresses/${address}/balance/confirmed`
  );

  const nanoErgs = BigInt(data.confirmed?.nanoErgs ?? 0);
  const ergs = nanoErgToErg(nanoErgs);

  return ok(
    `Balance for ${address}\n` +
    `  ERG:     ${ergs}\n` +
    `  nanoERG: ${nanoErgs.toString()}`
  );
}

async function ergoGetHeight(config: ServerConfig): Promise<ToolResult> {
  const data = await apiGet<{ fullHeight: number }>(config.nodeUrl, "/api/v1/info");
  return ok(`Current Ergo blockchain height: ${data.fullHeight}`);
}

async function ergoGetUtxos(
  config: ServerConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const address = (params["address"] as string | undefined) || config.address;
  if (!address) {
    return err("No address provided and no agent address configured.");
  }

  const limit = typeof params["limit"] === "number" ? params["limit"] : 20;

  const data = await apiGet<{ items: Array<{
    boxId: string;
    value: string | number;
    creationHeight: number;
    assets?: unknown[];
  }> }>(
    config.nodeUrl,
    `/api/v1/boxes/unspent/byAddress/${address}?limit=${limit}`
  );

  const items = data.items ?? [];

  if (items.length === 0) {
    return ok(`No unspent boxes found for ${address}`);
  }

  const lines = [
    `Unspent boxes for ${address} (showing up to ${limit}):`,
    "",
  ];

  for (const box of items) {
    const nanoErgs = BigInt(box.value);
    const ergs = nanoErgToErg(nanoErgs);
    const hasAssets = (box.assets?.length ?? 0) > 0;
    lines.push(
      `  Box ID:         ${box.boxId}\n` +
      `  Value:          ${ergs} (${nanoErgs} nanoERG)\n` +
      `  Creation Height:${box.creationHeight}\n` +
      `  Has tokens:     ${hasAssets}\n`
    );
  }

  lines.push(`Total: ${items.length} box(es)`);
  return ok(lines.join("\n"));
}

async function ergoCheckNote(
  config: ServerConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const noteBoxId = params["note_box_id"] as string | undefined;
  if (!noteBoxId) {
    return err("note_box_id is required.");
  }

  const [boxData, infoData] = await Promise.all([
    apiGet<{
      boxId: string;
      value: string | number;
      additionalRegisters?: Record<string, string>;
    }>(config.nodeUrl, `/api/v1/boxes/${noteBoxId}`),
    apiGet<{ fullHeight: number }>(config.nodeUrl, "/api/v1/info"),
  ]);

  const registers = boxData.additionalRegisters ?? {};
  const currentBlock = infoData.fullHeight;
  const nanoErgs = BigInt(boxData.value);
  const ergs = nanoErgToErg(nanoErgs);

  // R4: reserve box ID (SColl[SByte])
  const r4Hex = registers["R4"];
  const reserveBoxId = r4Hex ? decodeSCollBytes(r4Hex) : null;

  // R5: expiry block height (SInt)
  const r5Hex = registers["R5"];
  const expiryBlock = r5Hex ? decodeSInt(r5Hex) : null;

  // R6: task hash (SColl[SByte])
  const r6Hex = registers["R6"];
  const taskHash = r6Hex ? decodeSCollBytes(r6Hex) : null;

  const isExpired =
    expiryBlock !== null ? currentBlock >= expiryBlock : false;

  const lines = [
    `Note Box: ${noteBoxId}`,
    ``,
    `  Value:         ${ergs} (${nanoErgs} nanoERG)`,
    `  Current block: ${currentBlock}`,
    `  Expiry block:  ${expiryBlock !== null ? expiryBlock : "not set"}`,
    `  Expired:       ${isExpired ? "YES" : "no"}`,
    `  Reserve box:   ${reserveBoxId ?? "not set"}`,
    `  Task hash:     ${taskHash ?? "not set"}`,
  ];

  return ok(lines.join("\n"));
}

async function ergoBuildPayment(
  config: ServerConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const to = params["to"] as string | undefined;
  const amountStr = params["amount"] as string | undefined;
  const memo = params["memo"] as string | undefined;

  if (!to) return err("'to' address is required.");
  if (!amountStr) return err("'amount' is required.");

  if (!config.address) {
    return err("No agent address configured. Pass --address when starting the server.");
  }

  const amountNanoErg = parseAmount(amountStr);

  // Fetch UTxOs for the agent address
  const utxoData = await apiGet<{ items: unknown[] }>(
    config.nodeUrl,
    `/api/v1/boxes/unspent/byAddress/${config.address}?limit=100&sortDirection=desc`
  );
  const inputs = utxoData.items ?? [];

  if (inputs.length === 0) {
    return err(`No UTxOs found for agent address ${config.address}.`);
  }

  // Fetch current height
  const infoData = await apiGet<{ fullHeight: number }>(config.nodeUrl, "/api/v1/info");
  const height = infoData.fullHeight;

  let output = new OutputBuilder(amountNanoErg.toString(), to);

  if (memo) {
    output = output.setAdditionalRegisters({
      R4: SColl(SByte, hexToBytes(encodeToHex(memo))),
    });
  }

  const unsignedTx = new TransactionBuilder(height)
    .from(inputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(output)
    .sendChangeTo(config.address)
    .payMinFee()
    .build()
    .toEIP12Object();

  const txJson = JSON.stringify(unsignedTx, null, 2);

  return ok(
    `Unsigned EIP-12 payment transaction built.\n` +
    `  From:   ${config.address}\n` +
    `  To:     ${to}\n` +
    `  Amount: ${nanoErgToErg(amountNanoErg)} (${amountNanoErg} nanoERG)\n` +
    `  Memo:   ${memo ?? "(none)"}\n\n` +
    `Sign this JSON with Nautilus or your server key, then submit with ergo_submit_transaction.\n\n` +
    `<unsigned_tx>\n${txJson}\n</unsigned_tx>`
  );
}

async function ergoSubmitTransaction(
  config: ServerConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const signedTxStr = params["signed_tx"] as string | undefined;
  if (!signedTxStr) {
    return err("'signed_tx' is required.");
  }

  let signedTx: unknown;
  try {
    signedTx = JSON.parse(signedTxStr);
  } catch {
    return err("'signed_tx' is not valid JSON.");
  }

  const txId = await apiPost<string>(
    config.nodeUrl,
    "/api/v1/transactions",
    signedTx
  );

  return ok(
    `Transaction submitted successfully.\n` +
    `  TX ID: ${txId}\n` +
    `  Explorer: https://explorer.ergoplatform.com/en/transactions/${txId}`
  );
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "ergo_get_balance",
    description: "Get confirmed ERG balance for an Ergo address",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Ergo address to check. Defaults to the configured agent address if omitted.",
        },
      },
    },
  },
  {
    name: "ergo_get_height",
    description: "Get current Ergo blockchain height",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ergo_get_utxos",
    description: "Get unspent UTxOs (boxes) for an Ergo address",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Ergo address to query. Defaults to the configured agent address.",
        },
        limit: {
          type: "number",
          description: "Maximum number of boxes to return. Default: 20.",
        },
      },
    },
  },
  {
    name: "ergo_check_note",
    description:
      "Inspect a Note box — fetch value, expiry, task hash, reserve reference, and whether it is expired",
    inputSchema: {
      type: "object",
      properties: {
        note_box_id: {
          type: "string",
          description: "Box ID of the Note to inspect.",
        },
      },
      required: ["note_box_id"],
    },
  },
  {
    name: "ergo_build_payment",
    description:
      "Build an unsigned EIP-12 payment transaction. Returns JSON to sign with Nautilus or a server key.",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient Ergo address.",
        },
        amount: {
          type: "string",
          description: "Amount to send, e.g. '0.005 ERG' or a nanoERG integer string.",
        },
        memo: {
          type: "string",
          description: "Optional memo stored in R4 of the output box.",
        },
      },
      required: ["to", "amount"],
    },
  },
  {
    name: "ergo_submit_transaction",
    description:
      "Submit a signed EIP-12 transaction to the Ergo network. Returns transaction ID.",
    inputSchema: {
      type: "object",
      properties: {
        signed_tx: {
          type: "string",
          description: "JSON string of the signed EIP-12 transaction.",
        },
      },
      required: ["signed_tx"],
    },
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  const server = new Server(
    { name: "ergo-agent", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const params = (rawArgs ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "ergo_get_balance":
          return await ergoGetBalance(config, params);

        case "ergo_get_height":
          return await ergoGetHeight(config);

        case "ergo_get_utxos":
          return await ergoGetUtxos(config, params);

        case "ergo_check_note":
          return await ergoCheckNote(config, params);

        case "ergo_build_payment":
          return await ergoBuildPayment(config, params);

        case "ergo_submit_transaction":
          return await ergoSubmitTransaction(config, params);

        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("ergo-agent-mcp fatal error:", e);
  process.exit(1);
});
