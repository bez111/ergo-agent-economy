# ergo-agent-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes Ergo blockchain payment tools to any MCP-compatible AI client. Once configured, AI assistants such as Claude Desktop, Cursor, and Windsurf can query balances, inspect UTxOs, check Note boxes, build unsigned payment transactions, and submit signed transactions — all directly from a conversation, without any additional tooling.

---

## Install

**Global install (recommended for Claude Desktop / Cursor)**

```bash
npm install -g ergo-agent-mcp
```

**Or run without installing via npx**

```bash
npx ergo-agent-mcp --address YOUR_ERGO_ADDRESS --network mainnet
```

---

## Claude Desktop configuration

Add the following block to your Claude Desktop `claude_desktop_config.json` (typically at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ergo-agent": {
      "command": "npx",
      "args": [
        "ergo-agent-mcp",
        "--address", "YOUR_ERGO_ADDRESS",
        "--network", "testnet"
      ]
    }
  }
}
```

Replace `YOUR_ERGO_ADDRESS` with your Ergo address and set `--network` to `mainnet` or `testnet`.

**Optional flags**

| Flag | Default | Description |
|------|---------|-------------|
| `--address` | `$ERGO_ADDRESS` env | Agent wallet address |
| `--network` | `mainnet` | `mainnet` or `testnet` |
| `--node-url` | Public API for chosen network | Custom Ergo node URL |

You can also set `ERGO_ADDRESS` and `ERGO_NODE_URL` as environment variables instead of using flags.

---

## Available tools

| Tool | Description |
|------|-------------|
| `ergo_get_balance` | Get confirmed ERG balance for an address |
| `ergo_get_height` | Get current Ergo blockchain height |
| `ergo_get_utxos` | List unspent UTxOs (boxes) for an address |
| `ergo_check_note` | Inspect a Note box: value, expiry, task hash, reserve reference |
| `ergo_build_payment` | Build an unsigned EIP-12 payment transaction |
| `ergo_submit_transaction` | Submit a signed EIP-12 transaction, returns TX ID |

---

## Tool details and example prompts

### `ergo_get_balance`

Get the confirmed ERG balance for the agent address or any other address.

**Parameters**
- `address` (optional) — Ergo address to check. Defaults to the configured agent address.

**Example prompts**
- "What's my ERG balance?"
- "How much ERG is in address 9f4QF8AD..."

---

### `ergo_get_height`

Returns the current full height of the Ergo blockchain.

**Parameters** — none

**Example prompts**
- "What's the current Ergo block height?"
- "How many blocks has Ergo processed?"

---

### `ergo_get_utxos`

Fetches unspent boxes for an address, showing boxId, value in ERG and nanoERG, creation height, and whether the box holds tokens.

**Parameters**
- `address` (optional) — defaults to agent address
- `limit` (optional, default 20) — max boxes to return

**Example prompts**
- "List my unspent boxes"
- "Show me the UTxOs for address 9f4QF8AD... with a limit of 5"

---

### `ergo_check_note`

Inspect an Ergo Note box (bearer IOU). Decodes R4 (reserve box ID), R5 (expiry block height), and R6 (task hash), and reports whether the Note is expired relative to the current chain height.

**Parameters**
- `note_box_id` (required) — Box ID of the Note

**Example prompts**
- "Check Note box abc123def456..."
- "Is Note box 9a3b1c2d... still valid?"

---

### `ergo_build_payment`

Builds an unsigned EIP-12 payment transaction from the agent's UTxOs. Returns the transaction JSON, which you can then sign with Nautilus wallet or a server-side key and submit with `ergo_submit_transaction`.

**Parameters**
- `to` (required) — recipient Ergo address
- `amount` (required) — e.g. `"0.005 ERG"` or a nanoERG integer string like `"5000000"`
- `memo` (optional) — metadata stored in R4 of the output box

**Example prompts**
- "Build a payment of 0.1 ERG to 9f4QF8AD..."
- "Prepare a transaction sending 5000000 nanoERG to 9hDDy... with memo 'invoice #42'"

---

### `ergo_submit_transaction`

Posts a signed EIP-12 transaction to the Ergo network and returns the transaction ID with an explorer link.

**Parameters**
- `signed_tx` (required) — JSON string of the signed EIP-12 transaction

**Example prompts**
- "Submit this signed transaction: {...}"
- "Broadcast my signed TX to the Ergo network"

---

## Development

```bash
git clone https://github.com/bez111/ergo-agent-economy
cd packages/ergo-agent-mcp

npm install
npm run build       # compile to dist/
npm run dev         # watch mode
npm run typecheck   # type-check without emitting

# Run locally
node dist/index.js --address YOUR_ADDRESS --network testnet
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js --address YOUR_ADDRESS
```

This opens a browser UI where you can invoke each tool interactively.

---

## License

MIT
