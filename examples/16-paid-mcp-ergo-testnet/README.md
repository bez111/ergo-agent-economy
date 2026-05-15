# 16 — Paid MCP on Ergo testnet

The **non-mock counterpart of example 15**. Same Accord lifecycle (Agreement → payment → tool → verification → settlement), but the rail is real: the buyer issues a Note via `ergo-agent-pay` on Ergo testnet, the seller's `@accord-protocol/rails-ergo` adapter verifies it on-chain and signs the redemption transaction.

```text
1. Buyer creates an Accord Agreement
2. Buyer issues a Note on Ergo testnet (real tx)
3. Buyer sends note_box_id to seller's MCP wrapper
4. Rails-ergo fetches the Note from the chain, validates predicate
5. Seller's handler runs (deterministic stand-in for a real repo audit)
6. Verifier signs a Verification Receipt
7. Rails-ergo redeems the Note (second testnet tx)
8. Settlement Receipt emitted with the redemption tx_id
```

## Setup

### 1. Two testnet wallets

You need a buyer wallet and a seller wallet, both with testnet ERG.

**Quickest path (Nautilus):**

1. Install [Nautilus](https://github.com/capt-nemo429/nautilus-wallet) browser extension.
2. Create two wallets — name them `accord-demo-buyer` and `accord-demo-seller`.
3. Fund the buyer with ~0.2 testnet ERG from the [testnet faucet](https://testnet.ergoplatform.com/faucet).
4. Copy both testnet addresses — you'll paste them into `.env`.

**Alternative paths:** see [`docs/testnet-wallet-setup.md`](../../docs/testnet-wallet-setup.md) for sigma-rust HD wallet and Minotaur CLI walkthroughs.

### 2. Plug in a signer

The demo's `common/setup.ts` ships with a placeholder signer that throws on call. Edit it to wire your actual signer. Three supported paths:

- **Nautilus** — call the `ergo` global from a browser context. Not directly usable in a Node CLI; for Node demos use one of the next two.
- **sigma-rust** — derive a private key from a BIP-39 mnemonic, sign EIP-12 unsigned txs locally. Recommended for production seller services.
- **Minotaur CLI** — invoke `minotaur sign --tx-file ...` from a child process. Easiest for a one-shot CLI demo.

For a process-bound signer bridge, use [`ergo-agent-server`](../../packages/ergo-agent-server/) as the service surface and keep key handling in operator-owned code.

### 3. Create a Reserve (one-time)

The Reserve backs every Note the buyer issues. First create `.env` at the
example root with the two addresses:

```ini
ACCORD_DEMO_BUYER_ADDR=<buyer testnet address>
ACCORD_DEMO_SELLER_ADDR=<seller testnet address>
```

The example scripts load this `.env` automatically. Then run the reserve setup
preflight and create the Reserve:

```bash
npm run preflight -- --reserve-setup
npm run setup:reserve
```

This submits a Reserve creation tx (~0.1 ERG locked, backs ~100 demo Notes). The script prints the tx id. Wait ~2 min for confirmation, then look up the resulting box id:

```bash
curl https://api-testnet.ergoplatform.com/api/v1/transactions/<tx-id>
```

The first output's `boxId` is your Reserve box id. Paste it into `.env`.

### 4. .env

Add the Reserve box id to `.env`:

```ini
ACCORD_DEMO_BUYER_ADDR=<buyer testnet address>
ACCORD_DEMO_SELLER_ADDR=<seller testnet address>
ACCORD_DEMO_RESERVE_BOX_ID=<64 hex from step 3>
```

Before running the on-chain demo, verify the environment and signer wiring:

```bash
npm run preflight
```

The preflight checks required env vars, placeholder values, buyer/seller
separation, Reserve box-id shape, disabled mainnet-danger flags, and whether
`common/setup.ts` still contains the placeholder signer.

## Run

```bash
npm install        # installs @accord-protocol/* + ergo-agent-pay from workspace
npm run preflight
npm run dev
```

Output:

```text
Accord Protocol — paid MCP repo-audit demo (Ergo testnet)

  ✓ Agreement created       acc_01HX0ERGO0TESTNET00000000000
     agreement_hash         blake2b256:0x…
  ✓ Note issued (testnet)   tx 0xabc…
     note_box_id            0xdef…
  ✓ MCP tool ran            2 finding(s)
  ✓ Verification Receipt    vr_…
  ✓ Settlement Receipt      sr_…
     settlement tx          0x123…
     explorer               https://testnet.ergoplatform.com/transactions/0x123…
```

Override the audited repo URL:

```bash
npm run dev -- --repo https://github.com/your-org/your-repo
```

## What's real vs mocked

| Layer | Status |
|-------|--------|
| Agreement Object | Real `accord.agreement.v0` |
| Acceptance predicate | Real ErgoScript task-hash predicate (computeTaskHashAsync from ergo-agent-pay) |
| Note issuance | **Real testnet tx** (ergo-agent-pay → Ergo node) |
| Note storage | **On-chain** |
| Rail verification | **Real** — `@accord-protocol/rails-ergo` reads the Note from chain |
| Seller handler | Stand-in (deterministic fakeAudit for repeatability) |
| Verifier | In-process, ed25519-shaped placeholder signature (matches example 15 — swap for a real verifier service to harden) |
| Note redemption | **Real testnet tx** |
| Settlement Receipt | Real `accord.settlement_receipt.v0` with on-chain tx_id |

## What this proves

That the Accord Protocol works end-to-end on a live chain. The Note in step 2 is queryable on `testnet.ergoplatform.com`. The settlement tx in step 7 moves real (testnet) ERG. Anyone can clone this example, point it at their own wallets, and observe the same lifecycle.

## Production references

This pattern is also used in [Sage](https://www.ergoblockchain.org) — the agent-economy concierge on ergoblockchain.org that charges testnet ERG for premium queries. Sage's premium-query gate, payment modal, and receipt page (`/r/sage/<id>`) are direct ports of the buyer/seller wiring shown here.

## Known gaps

- **note_box_id resolution**: `ergo-agent-pay` exposes `NoteResult.noteBoxId` when the configured signer returns signed tx outputs with box ids. `buyer/resolve-note-box.ts` polls the explorer only as a fallback when the signer/submit endpoint returns `txId` alone.
- **Verifier signing key**: The demo verifier emits a placeholder ed25519 signature. Hardening = swap `verifier/sign.ts` to call your verifier service's signing endpoint with `signingHashRaw(receipt)` from `@accord-protocol/core`.
- **Settlement timing**: The demo waits synchronously for tx confirmation. Real services should accept a `settlement_pending` state and poll asynchronously.

## See also

- [`examples/02-note-payment`](../02-note-payment/) — Note issuance without the Accord agreement layer
- [`examples/15-paid-mcp-repo-audit/`](../15-paid-mcp-repo-audit/) — same demo with the in-process Mock rail
- [`packages/accord-rails-ergo/README.md`](../../packages/accord-rails-ergo/README.md) — adapter API surface
- [`packages/ergo-agent-pay/README.md`](../../packages/ergo-agent-pay/README.md) — buyer-side SDK
