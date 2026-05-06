# ergo-agent-cli

Command-line companion to [`ergo-agent-pay`](../ergo-agent-pay). Lets you query
balances, inspect Notes, and build Reserve / Note / Tracker transactions
without writing a Node script.

## Install

```bash
npm install -g ergo-agent-cli
```

Or run without installing:

```bash
npx ergo-agent task-hash "the answer is 42"
```

## Quick start

```bash
# 1. Compute a BLAKE2b-256 task hash (no network needed).
ergo-agent task-hash "the answer is 42"
# 549ead194a83140a8b12bc38bb74ba7e5b094a5749ea73a7e04156f91cc5260a

# 2. Set up your address. CLI defaults to testnet.
export ERGO_ADDRESS=9...

# 3. Check balance and chain height.
ergo-agent balance
ergo-agent height

# 4. Inspect a Note already on-chain.
ergo-agent note check abc123...

# 5. Build an unsigned Note transaction (testnet, no script — dev mode).
ergo-agent note issue \
  --recipient 9YourSubAgent... \
  --value "0.005 ERG" \
  --reserve abc123... \
  --deadline "+100 blocks" \
  --task-output "the answer is 42"
```

The unsigned transaction is printed as JSON on stdout. Sign it with Nautilus
or a server-side key, then submit to the Ergo node.

## Configuration

| Flag | Env var | Default | Notes |
|---|---|---|---|
| `--address <addr>` | `ERGO_ADDRESS` | — | Required for any command that touches the chain. |
| `--network mainnet\|testnet` | `ERGO_NETWORK` | `testnet` | The CLI defaults to **testnet** on purpose — opposite of the SDK. |
| `--node-url <url>` | `ERGO_NODE_URL` | public Ergo API | Override for self-hosted nodes. |
| `--allow-insecure-dev-mode` | `ERGO_ALLOW_INSECURE_DEV_MODE=1` | `false` | Required to run mainnet ops without a compiled `scriptErgoTree`. See [SPEC.md §6](../../SPEC.md). |
| `--json` | — | `false` | Emit a single JSON object on stdout (no labels). |

CLI flags override environment variables.

## Commands

### `task-hash`

Compute the BLAKE2b-256 hash of a task output. Network-free utility.

```bash
ergo-agent task-hash "the answer is 42"   # positional UTF-8
ergo-agent task-hash --hex deadbeef       # raw hex bytes
ergo-agent task-hash --file payload.json  # file contents
echo "..." | ergo-agent task-hash --stdin
```

The output is a 64-character hex digest with no trailing punctuation, so it
captures cleanly inside `$()`.

### `balance` / `height`

```bash
ergo-agent balance       # ERG balance + nanoERG raw
ergo-agent height        # current chain height (single integer on stdout)
```

### `note check <boxId>`

Fetch a Note from the chain and decode its registers (face value, expiry,
reserve reference, task hash, credential key).

### `note issue`

Build a new Note. Either `--task-hash <hex>` *or* `--task-output <text>` —
the second form computes the BLAKE2b-256 hash for you.

```
--recipient <addr>          (required)
--value "<amount> ERG"      (required, e.g. "0.005 ERG")
--reserve <boxId>           (required, the backing Reserve)
--deadline "+N blocks"      (required, or absolute height)
--task-hash <hex>           (optional, 64-char BLAKE2b-256)
--task-output <text>        (optional, alternative to --task-hash)
--credential-key <hex>      (optional, GroupElement for credential gating)
--script <ergoTree>         (optional, compiled predicate ErgoTree)
```

### `note redeem`

```
--box <noteBoxId>           (required)
--task-output <text>        (optional, required for predicate-bound Notes)
--receiver <addr>           (optional, defaults to the agent address)
```

### `reserve create`

```
--collateral "<amount> ERG" (required)
--script <ergoTree>         (optional, compiled Reserve script)
--memo <text>               (optional, stored in R4)
```

### `tracker deploy`

```
--script <ergoTree>         (required, compiled Tracker script)
```

### `settle`

Batch-redeem multiple Notes in one transaction.

```
--boxes id1,id2,id3                          (required)
--task-outputs "id1=output1;id2=output2"     (optional)
--receiver <addr>                            (optional)
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | runtime error (network, signing, etc.) |
| `2` | argument or config error |
| `3` | `INSECURE_MAINNET_MODE` — refused to run an unsafe mainnet op without `--allow-insecure-dev-mode` |

## Safety

The CLI inherits the SDK's `assertProductionSafety` guardrail. On mainnet it
will refuse to run `reserve create`, `note issue`, or `tracker deploy`
without a compiled `--script`, unless `--allow-insecure-dev-mode` is set.
On testnet there is no such restriction. See
[SPEC.md §6](../../SPEC.md) and [SECURITY.md](../../SECURITY.md).
