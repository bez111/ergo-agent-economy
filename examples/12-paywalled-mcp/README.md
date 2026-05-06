# 12 — Paywalled MCP server

Killer demo for the agent-economy story: a server-side MCP tool that
**runs only after the calling agent attaches a valid Ergo Note**. The
Claude/Cursor/Windsurf-side agent verifies the Note on-chain via
`ergo-agent-api`'s pure-function gate, optionally redeems it inline,
then runs the actual handler — the same one a non-paywalled MCP server
would have.

```
   ┌──────────────────┐                  ┌────────────────────────────┐
   │  Calling agent   │                  │  This MCP server           │
   │  (Claude / etc)  │                  │                            │
   │                  │── tools/call ──► │  createPaywalledTool({     │
   │                  │   summarise(     │    pricing: 1_000_000n,    │
   │                  │     text,        │    agent: ...,             │
   │                  │     note_box_id, │    redeemStrategy: "...",  │
   │                  │     task_output) │  })                        │
   │                  │                  │                            │
   │                  │                  │  → checkNote()             │
   │                  │                  │  → atomic replay claim     │
   │                  │                  │  → redeemNote()            │
   │                  │                  │  → run user handler        │
   │                  │                  │                            │
   │                  │ ◄── result ───── │  isError on rejection      │
   └──────────────────┘                  └────────────────────────────┘
```

## What's in the box

| File | Role |
|---|---|
| `server.ts` | MCP server that exposes one paywalled tool (`summarise`) and one free tool (`agent_address`). |
| `package.json` | Workspace metadata. |

## Run it

```bash
# Terminal 1 — the MCP server
cd examples/12-paywalled-mcp
ERGO_ADDRESS=9X... npx tsx server.ts

# Terminal 2 — your MCP-compatible client
# Claude Desktop / Cursor: add a stdio-mcp server entry pointing at the
# server.ts process. The summarise tool will appear with note_box_id and
# task_output fields in its input schema.
```

## What the calling agent sees

The tool's `inputSchema` (from MCP `tools/list`) gets the payment
fields automatically injected:

```json
{
  "name": "summarise",
  "description": "Pay 0.001 ERG to receive a one-line summary of `text`.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text":         { "type": "string" },
      "note_box_id":  { "type": "string", "description": "Box ID of an Ergo Note covering this tool's price. Required." },
      "task_output":  { "type": "string", "description": "Optional task-output bytes for predicate-bound Notes." }
    },
    "required": ["text", "note_box_id"]
  }
}
```

If the agent calls `summarise({ text, note_box_id })` with a valid
Note, it gets the summary back. If the Note is missing / expired /
under-priced / already-claimed, the tool returns an MCP error result
with structured metadata:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Payment required for tool \"summarise\": [VALUE_TOO_LOW] Note value 500 nanoERG is below required price 1000000 nanoERG." }],
  "_meta": {
    "error_code": "VALUE_TOO_LOW",
    "tool": "summarise",
    "required_nano_erg": "1000000"
  }
}
```

Same vocabulary as the HTTP 402 response from `ergo-agent-api`.
Clients that already handle one transport handle both.

## Why this matters

Today, MCP tools run for free. A malicious or runaway agent can spam
expensive tools (LLM inference, scraping, compute) without paying. The
host typically rate-limits or refuses requests outside an allowlist.

With paywalled tools:

* Every call requires an Ergo Note → no free queries.
* Per-tool pricing → expensive tools cost more.
* Note's acceptance predicate (R6 task hash) → the calling agent
  commits to what they expect before the work runs; can't dispute
  outcomes after.
* Notes are bearer instruments → the calling agent can buy a Note
  from a third party, no relationship with the server required.

Combined with `ergo-agent-rosen`, the same flow works in rsUSDT, so
agents pay in stablecoin terms.
