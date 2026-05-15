# Ergo Testnet Wallet Setup

This guide supports the Ergo testnet examples and pilots. It is not a
mainnet guide. Use fresh testnet-only keys, keep balances small, and do not
reuse production wallet material.

## Required Roles

Use two separate testnet identities:

| Role | Purpose | Minimum funding |
|---|---|---:|
| Buyer | Creates the Reserve and issues Notes | 0.2 testnet ERG |
| Seller | Receives redeemed Note value | 0.05 testnet ERG |

Both addresses should be ordinary Ergo testnet addresses. Keep the buyer and
seller keys separate so replay, refund, and settlement failures are easier to
debug.

## Path A - Browser Wallet

Use this path when you want the fastest manual setup.

1. Install a wallet that supports Ergo testnet.
2. Create two wallets named `accord-demo-buyer` and `accord-demo-seller`.
3. Switch both wallets to testnet.
4. Fund the buyer from the Ergo testnet faucet.
5. Copy both addresses into the example `.env` file.

Browser wallets are convenient for funding and inspection. They are not a
direct Node.js signer for `examples/16-paid-mcp-ergo-testnet`; for the CLI
demo, pair this path with a local signer or bridge process.

## Path B - Local HD Signer

Use this path when a service needs repeatable Node-side signing.

1. Generate a new BIP-39 mnemonic for testnet only.
2. Derive buyer and seller addresses from distinct account paths.
3. Store the mnemonic in your local secret manager, not in this repository.
4. Implement `SignerFn` in `examples/16-paid-mcp-ergo-testnet/common/setup.ts`.
5. Log unsigned transaction ids and output indexes before broadcasting.

For a process-bound signer service, use
[`packages/ergo-agent-server`](../packages/ergo-agent-server/) as the bridge
surface and keep the actual key handling outside the repository. Treat any
local signer implementation as operator-specific wiring, not as a reason to
commit secrets.

## Path C - CLI Signer

Use this path for one-off pilot runs where an operator signs each transaction.

1. Export unsigned EIP-12 transactions to a local temp directory.
2. Sign them with your chosen Ergo CLI wallet.
3. Submit the signed transaction through the testnet node or explorer API.
4. Capture the submitted transaction id and output indexes.
5. Delete unsigned and signed transaction files after the pilot evidence is
   copied into the result record.

This path is slower but gives the clearest audit trail for a first pilot.

## Environment File

For example 16, create `examples/16-paid-mcp-ergo-testnet/.env`:

```ini
ACCORD_DEMO_BUYER_ADDR=9f...
ACCORD_DEMO_SELLER_ADDR=9g...
ACCORD_DEMO_RESERVE_BOX_ID=<64 hex reserve box id>
```

Never add `.env`, mnemonics, private keys, or signed transaction payloads to
git.

## Evidence To Capture

For every pilot run, record:

- buyer and seller testnet addresses;
- Reserve creation transaction id and Reserve box id;
- Note issuance transaction id, Note box id, and output index;
- Verification Receipt id and hash;
- Settlement Receipt id and settlement transaction id;
- explorer URLs for Reserve, Note, and settlement transactions;
- command evidence for `npm run release:check` and relevant conformance runs.

Use [`docs/pilots/result-template.md`](./pilots/result-template.md) for the
final record.

## Failure Handling

If a pilot fails:

- stop issuing new Notes from the same Reserve;
- preserve logs and unsigned transaction payloads until the failure is
  classified;
- refund or let testnet Notes expire when possible;
- rotate testnet hot keys if a signer or local secret file may have leaked;
- turn deterministic failures into tests before rerunning the pilot.
