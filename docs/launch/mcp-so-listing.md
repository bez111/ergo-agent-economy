# mcp.so listing copy

Submission text for the public [mcp.so](https://mcp.so) registry. The
`mcp.json` manifest lives at
[`packages/ergo-agent-mcp/mcp.json`](../../packages/ergo-agent-mcp/mcp.json)
and is the machine-readable form; this file is the human-readable
description for the website.

---

**Name:** Ergo Agent

**Slug:** `ergo-agent`

**One-liner:** Lets MCP-compatible agents hold ERG, check Note boxes
on the Ergo blockchain, build payment transactions, and offer paywalled
tools that gate execution behind a real on-chain Note.

**Long description:**

`ergo-agent-mcp` is the MCP server for the AgentPay v0 protocol on
Ergo. It exposes the SDK's full lifecycle — `pay`, `issueNote`,
`redeemNote`, `createReserve`, `deployTracker`, `settleBatch`, plus
the BLAKE2b-256 task-hash utility — as MCP tools any compatible host
(Claude Desktop, Cursor, Windsurf, Continue, …) can call.

Most MCP servers run their tools for free. This one ships a
`createPaywalledTool` helper so a server author can gate any tool
behind a real Note: the tool's input schema gets `note_box_id` and
`task_output` injected automatically, the wrapper verifies the Note
on-chain, redeems it inline (when a signer is configured), and
otherwise returns a structured 402-style error.

This brings MCP into the agent-economy story. An LLM-driven agent
can buy access to expensive tools on demand without a relationship
to the server, and a server author can offer compute / inference /
scraping for sale to anyone holding the right Note.

**Tags:** ergo · agent-payments · ai-agents · blockchain · stablecoin
· model-context-protocol · agent-economy · blake2b

**Homepage:** https://github.com/accord-protocol/accord-protocol
**Documentation:** https://github.com/accord-protocol/accord-protocol/blob/main/packages/ergo-agent-mcp/README.md
**License:** MIT
**Maintainer:** [bez111](https://github.com/bez111)

**Configuration block (claude_desktop_config.json):**

```json
{
  "mcpServers": {
    "ergo-agent": {
      "command": "npx",
      "args": ["ergo-agent-mcp", "--address", "YOUR_ERGO_ADDRESS", "--network", "testnet"]
    }
  }
}
```

Replace `YOUR_ERGO_ADDRESS` with an Ergo wallet address (Nautilus,
Lace via Ergo cardano-style, etc.). Get free testnet ERG at
https://testnet.ergofaucet.org.

**Status:**

- npm: `ergo-agent-mcp@0.3.0` — published on tag.
- Mainnet: blocked at the audit gate. Testnet works fully.
- Source repo: https://github.com/accord-protocol/accord-protocol

**Caveats for the listing reviewer:**

Mainnet writes are deliberately gated behind an external audit. The
SDK refuses to issue Notes / create Reserves / deploy Trackers on
mainnet unless the supplied ergoTree's hash appears in
`AUDITED_ERGOTREES.json` with `mainnetAllowed: true`, currently
unsigned. This is documented at the top of the SECURITY.md and on
every error message users will see if they try.
