# 11 — Cross-chain agent payment via Rosen Bridge

This is an architecture / testnet-first example. It is not a mainnet launch
guide and it does not certify Rosen, Ergo, or Accord artifacts for production.
Follow [`../../SECURITY.md`](../../SECURITY.md) and the audit manifests before
any mainnet use.

The story we tell prospective integrators: **agents pay in USDT/USDC,
settle on Ergo with native programmable predicates, hold no exotic
token themselves**.

```
   ┌─────────────────┐                       ┌────────────────────┐
   │  Buyer agent    │                       │  Seller API        │
   │  (any chain)    │                       │  (Express +        │
   │  holds USDT     │                       │   ergo-agent-api)  │
   └────────┬────────┘                       └─────────┬──────────┘
            │ 1. bridgeUrl(...)                        │
            │    user clicks → MetaMask                │
            │    locks USDT on Ethereum                │
            │                                          │
            │ 2. (Rosen watchers, ~30 min)             │
            │                                          │
            ▼                                          │
   ┌─────────────────┐                                 │
   │  rsUSDT on      │                                 │
   │  Ergo address   │                                 │
   └────────┬────────┘                                 │
            │ 3. createReserve(rsUSDT)                 │
            │    issueNote(5 rsUSDT, taskHash)         │
            │                                          │
            │ 4. POST /api/analyze                     │
            │    X-Note-Box-Id: ...                    │
            │    X-Task-Output: ...                    │
            │ ──────────────────────────────────────► │
            │                                          │ 5. checkNote +
            │                                          │    redeemNote
            │                                          │    middleware
            │                                          │    pays seller in
            │                                          │    rsUSDT on Ergo
            │ ◄────────────────────────────────────── │
            │  200 { result, payment }                 │
            │                                          │
            │                              6. (later)  ▼
            │                                ┌────────────────┐
            │                                │ Seller bridges │
            │                                │ rsUSDT → USDT  │
            │                                │ on Ethereum    │
            │                                │ (one TX, batch │
            │                                │  payouts daily)│
            │                                └────────────────┘
```

## Pieces in play

| Package | Role here |
|---|---|
| [`ergo-agent-rosen`](../../packages/ergo-agent-rosen) | Token resolution + bridge URL + Reserve / Note helpers wired to `basis_token_reserve_v0`. |
| [`ergo-agent-pay`](../../packages/ergo-agent-pay) | SDK both sides drive. Mainnet remains blocked unless signed manifests allow the exact tree. |
| [`ergo-agent-scripts`](../../packages/ergo-agent-scripts) | Compiled `basis_token_reserve_v0` ergoTree from the manifest-gated registry. |
| [`ergo-agent-api`](../../packages/ergo-agent-api) | Express middleware on the seller side. |
| [`@rosen-bridge/tokens`](https://npmjs.com/package/@rosen-bridge/tokens) | Canonical Rosen TokenMap (peer dep). |

## Run

You need:

* Node 18+
* A funded Ergo address (testnet for first run)
* MetaMask or another EVM wallet for the buyer
* A Rosen TokenMap JSON for the network you are testing (from
  `@rosen-bridge/tokens` or Rosen ops) — passed via `ROSEN_TOKEN_MAP_PATH`

```bash
# Terminal 1 — seller API
cd examples/11-cross-chain-rosen
npm install
SELLER_ADDRESS=9X... \
ROSEN_TOKEN_MAP_PATH=./rosen-testnet-tokens.json \
node server.ts

# Terminal 2 — buyer agent (TS)
BUYER_ADDRESS=9Y... \
SELLER_ADDRESS=9X... \
RESERVE_BOX_ID=abc... \
ROSEN_TOKEN_MAP_PATH=./rosen-testnet-tokens.json \
node agent.ts
```

The buyer's `agent.ts` first prints a bridge URL (one-time setup if
the buyer doesn't already hold rsUSDT). After bridging, subsequent
agent calls reuse the rsUSDT balance.

If your signer returns signed transaction outputs with box ids, `agent.ts`
uses `NoteResult.noteBoxId` directly. If the signer or submit endpoint returns
only `txId`, the script exits after issuance and tells you to resolve the Note
output at `noteOutputIndex` through your testnet node or explorer, then rerun
with `NOTE_BOX_ID=<resolved box id>`.

## What changes vs. example 07

| Aspect | Example 07 (ERG-only) | Example 11 (rsUSDT via Rosen) |
|---|---|---|
| Reserve script | `task_hash_v0` (P2PK Note) | `basis_token_reserve_v0` (token-collateralised) |
| Note value | nanoERG | rsUSDT (6 decimals) |
| Buyer onboarding | Need ERG via faucet | Bridge USDT once via Rosen UI |
| Seller payout | Receives ERG | Receives rsUSDT, batch-bridges out daily |
| Volatility | Buyer carries ERG risk | Buyer is USD-stable end to end |

Both examples live side by side. The audit gate is identical (manifest
binding by name); the choice between them is a UX one — what does the
buyer already hold?
