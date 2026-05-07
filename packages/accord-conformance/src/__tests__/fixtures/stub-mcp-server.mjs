#!/usr/bin/env node
// Minimal MCP-stdio server stub used by the conformance suite's L1
// MCP-stdio probe test. Speaks JSON-RPC 2.0 over line-delimited stdio.
// Implements `initialize`, `tools/list`, and `tools/call` with the
// Accord/MCP fields injected into the tool's inputSchema.
//
// `tools/call` returns:
//   * { isError: true, _meta: { accord_error_code: 'MISSING_AGREEMENT_ID' } }
//     when the args don't include accord_agreement_id
//   * { isError: true, _meta: { accord_error_code: 'MISSING_PAYMENT' } }
//     when accord_payment is missing
//   * { ok: true, _meta: { ... } } otherwise (we don't run a real handler;
//     the conformance probe doesn't reach this branch in v0)

import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

rl.on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  if (typeof req.id !== "number") return; // notifications

  switch (req.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "stub-mcp-server", version: "0.0.0" },
        },
      });
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: [
            {
              name: "stub_paid_tool",
              description: "Stub paid tool for L1 MCP-stdio probing",
              inputSchema: {
                type: "object",
                properties: {
                  accord_agreement_id: { type: "string" },
                  accord_payment: { type: "object" },
                  accord_task_output: { type: "string" },
                  text: { type: "string" },
                },
                required: ["accord_agreement_id", "accord_payment"],
              },
            },
          ],
        },
      });
      break;

    case "tools/call": {
      const args = req.params?.arguments ?? {};
      if (!args.accord_agreement_id) {
        send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            isError: true,
            content: [{ type: "text", text: "MISSING_AGREEMENT_ID" }],
            _meta: { accord_error_code: "MISSING_AGREEMENT_ID" },
          },
        });
        break;
      }
      if (!args.accord_payment) {
        send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            isError: true,
            content: [{ type: "text", text: "MISSING_PAYMENT" }],
            _meta: { accord_error_code: "MISSING_PAYMENT" },
          },
        });
        break;
      }
      send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          content: [{ type: "text", text: "ok" }],
          _meta: { accord_agreement_id: args.accord_agreement_id },
        },
      });
      break;
    }

    default:
      send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "method not found" },
      });
  }
});
