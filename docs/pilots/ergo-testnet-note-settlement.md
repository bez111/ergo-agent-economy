# Pilot - Ergo Testnet Note Settlement

## Goal

Validate the non-mock paid MCP flow on Ergo testnet using
[`examples/16-paid-mcp-ergo-testnet`](../../examples/16-paid-mcp-ergo-testnet/).

## Scenario

The buyer creates a Reserve, issues a Note, calls the seller's paid MCP tool,
receives a Verification Receipt, and the seller redeems the Note into a
Settlement Receipt with a testnet transaction id.

## Preflight

```bash
npm install --include=optional
npm run build
npm run typecheck
npm test -w accord-paid-mcp-ergo-testnet-demo
npm run preflight -w accord-paid-mcp-ergo-testnet-demo -- --reserve-setup
npm run release:check
```

Create testnet wallets with [`../testnet-wallet-setup.md`](../testnet-wallet-setup.md).

## Run

```bash
cd examples/16-paid-mcp-ergo-testnet
npm run preflight -- --reserve-setup
npm run setup:reserve
npm run preflight
npm run dev
```

## Expected Receipts

| Receipt | Expected |
|---|---|
| Agreement | `rail: "ergo"`, `mode: "note"`, Reserve box id present |
| Verification Receipt | accepted repo-audit report |
| Settlement Receipt | `mode: "note_redeemed"`, testnet tx id and box id |
| Conformance | current repo conformance remains passing |

## Rollback Plan

- Stop issuing Notes from the Reserve after the first failure.
- Record the Reserve box id, Note box id, and any pending settlement tx.
- If a Note was issued but not redeemed, wait for expiry or refund through the
  testnet wallet path when available.
- Rotate testnet keys if local signer material was exposed.

## Pass Criteria

- Note issuance and redemption appear on the Ergo testnet explorer.
- Settlement Receipt `agreement_hash` matches the original Agreement.
- No dangerous mainnet override flags are set.
- Failure modes are classified before rerun.
