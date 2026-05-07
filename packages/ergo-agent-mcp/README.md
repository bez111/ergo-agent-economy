# ergo-agent-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes Ergo blockchain payment tools to any MCP-compatible AI client. Once configured, AI assistants such as Claude Desktop, Cursor, and Windsurf can query balances, inspect Note boxes, **drive the full Reserve / Note / Tracker lifecycle**, and build/submit transactions — all directly from a conversation, without any additional tooling.

The lifecycle tools delegate to [`ergo-agent-pay`](../ergo-agent-pay) so the safety guardrail and BLAKE2b-256 hashing live in a single place. Mainnet operations without a compiled `script_ergo_tree` are refused with `INSECURE_MAINNET_MODE` unless the server is started with `--allow-insecure-dev-mode`. See [SPEC.md](../../SPEC.md) §6.

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
| `--allow-insecure-dev-mode` | `$ERGO_ALLOW_INSECURE_DEV_MODE=1` | Permit mainnet lifecycle ops without a compiled `script_ergo_tree` (testnet/dev only). |

You can also set `ERGO_ADDRESS`, `ERGO_NODE_URL`, and `ERGO_ALLOW_INSECURE_DEV_MODE` as environment variables instead of using flags.

---

## Available tools

**Read & basic transactions**

| Tool | Description |
|------|-------------|
| `ergo_get_balance` | Get confirmed ERG balance for an address |
| `ergo_get_height` | Get current Ergo blockchain height |
| `ergo_get_utxos` | List unspent UTxOs (boxes) for an address |
| `ergo_check_note` | Inspect a Note box: value, expiry, task hash, reserve reference |
| `ergo_build_payment` | Build an unsigned EIP-12 payment transaction |
| `ergo_submit_transaction` | Submit a signed EIP-12 transaction, returns TX ID |

**Lifecycle (delegates to ergo-agent-pay)**

| Tool | Description |
|------|-------------|
| `ergo_task_hash` | BLAKE2b-256 of a task output. Network-free. |
| `ergo_create_reserve` | Build a Reserve creation TX (collateral). Refuses on mainnet without `script_ergo_tree`. |
| `ergo_issue_note` | Build a Note issuance TX. Either `task_hash` (hex) or `task_output` (auto-hashed). |
| `ergo_redeem_note` | Build a Note redemption TX. Pass `task_output` for predicate-bound Notes. |
| `ergo_deploy_tracker` | Build a Tracker deployment TX. Always requires `script_ergo_tree`. |
| `ergo_settle_batch` | Build a batch redemption TX for multiple Notes. |

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

### `ergo_task_hash`

Compute the BLAKE2b-256 of a task output. Mirror of `computeTaskHash` in the
TypeScript SDK and `compute_task_hash` in the Python SDK — same shared
golden vectors at [`test-vectors/task-hash.json`](../../test-vectors/task-hash.json).

**Parameters** — exactly one of:
- `text` — UTF-8 text input
- `hex` — hex-encoded byte input

**Example prompts**
- "Compute the task hash for 'the answer is 42'"
- "What's the BLAKE2b hash of the bytes 0102deadbeef?"

---

### `ergo_create_reserve`

Build an unsigned EIP-12 transaction that creates a Reserve box.
**Refuses on mainnet** without `script_ergo_tree` unless the server was
started with `--allow-insecure-dev-mode`.

**Parameters**
- `collateral` (required) — e.g. `"1 ERG"` or a nanoERG integer
- `script_ergo_tree` (optional, **required for mainnet**) — compiled Reserve script
- `memo` (optional) — UTF-8 memo stored in R4

---

### `ergo_issue_note`

Build a Note issuance TX. Provide either `task_hash` (precomputed hex) or
`task_output` (the server hashes it via BLAKE2b-256).

**Parameters**
- `recipient` (required) — receiver Ergo address
- `value` (required) — face value, e.g. `"0.005 ERG"`
- `reserve_box_id` (required) — Box ID of the backing Reserve
- `deadline` (required) — absolute height integer or `"+N blocks"`
- `task_hash` (optional) — 64-char hex BLAKE2b-256 digest
- `task_output` (optional) — task output text; mutually exclusive with `task_hash`
- `credential_key` (optional) — GroupElement / hex public key
- `script_ergo_tree` (optional, **required for mainnet**) — compiled predicate

---

### `ergo_redeem_note`

Build a Note redemption TX. The SDK injects `task_output` as context
variable 0 in sigma `Coll[Byte]` form.

**Parameters**
- `note_box_id` (required)
- `task_output` (optional) — required for predicate-bound Notes (R6 set)
- `receiver_address` (optional) — defaults to agent address

---

### `ergo_deploy_tracker`

Build a Tracker deployment TX. Always requires `script_ergo_tree` — there
is no dev fallback in v0 because a P2PK "tracker" provides no on-chain
double-spend resistance.

**Parameters**
- `script_ergo_tree` (required)

---

### `ergo_settle_batch`

Build a batch redemption TX. `task_outputs` is an object mapping
predicate-bound boxIds to their task output text.

**Parameters**
- `note_box_ids` (required) — array of strings, or comma-separated string
- `task_outputs` (optional) — `{ "boxId": "task output text", ... }`
- `receiver_address` (optional)

---

## Development

```bash
git clone https://github.com/bez111/accord-protocol
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
