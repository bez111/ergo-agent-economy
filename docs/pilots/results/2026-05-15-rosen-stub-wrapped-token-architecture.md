# Pilot Result - Rosen Stub Wrapped-Token Architecture

## Summary

| Field | Value |
|---|---|
| Pilot | Rosen wrapped-token architecture |
| Date | 2026-05-15 |
| Operator | Codex local Rosen stub run |
| Git commit | `b6a2300574a280a33afe78ef2730286768528d47` |
| Network | Rosen / Ergo testnet local stub |
| Result | `pass` |

## Scenario

- User story: a buyer pays for a wrapped-token task with a Rosen-style Ergo
  Note carrying `rsUSDT`; the adapter resolves the token through an explicit
  TokenMap stub, checks decimals and amount, verifies the task hash, and emits
  a Settlement Receipt linked to the Verification Receipt.
- Rail: `rosen`.
- Tool or endpoint: `scripts/run-rosen-stub-pilot.mjs`.
- Buyer identity: `agent://rosen-stub-buyer`.
- Seller identity: `provider://accord-rosen-stub-seller`.
- Verifier identity: `verifier://rosen-stub-v0`.

## Commands

```bash
npm run build -w @accord-protocol/core
npm run build -w @accord-protocol/rails
npm run build -w @accord-protocol/rails-rosen
npm test -w @accord-protocol/rails-rosen
npm test -w ergo-agent-rosen
npm run pilots:rosen:stub
node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4
npm run release:check
```

Command evidence:

- `npm test -w @accord-protocol/rails-rosen`: 16 tests passed, 0 failed.
- `npm test -w ergo-agent-rosen`: 23 tests passed, 0 failed.
- `npm run pilots:rosen:stub`: emitted a passing evidence JSON with explicit
  TokenMap hash, accounting check, wrong-TokenMap rejection, and receipt checks.
- `node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4`:
  Achieved L4.
- `npm run release:check`: passed.

## Expected Receipts

| Receipt | Required? | Expected evidence |
|---|---:|---|
| Agreement | Yes | `agreement_id`, `agreement_hash`, `rail: "rosen"`, `currency: "rsUSDT"` |
| Verification Receipt | Yes | `receipt_id`, verifier id, accepted result |
| Settlement Receipt | Yes | `settlement_id`, rail, Note box id, redemption tx id |
| Conformance Result | Yes | L0-L4 output |

## Observed Receipts

```json
{
  "agreement_id": "acc_rosen_stub_20260515",
  "agreement_hash": "blake2b256:0x57e12faafa847cfe0cb08740005dacff7b14c71d17d6ddef855905c662edf27c",
  "verification_receipt_id": "vr_CBR5PPWA5RG8KV3CE1HVH6XPKM",
  "settlement_receipt_id": "sr_CG6Z85YGZJY3RZ3Z840EM2ZX7K",
  "settlement_tx_id": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "conformance_result": "Achieved: L4"
}
```

## Explorer / External Evidence

- Reserve tx: N/A - local Rosen architecture stub, no live bridge or chain submit.
- Reserve box:
  `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`.
- Note tx: N/A - local Rosen architecture stub, no live bridge or chain submit.
- Note box:
  `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.
- Settlement tx:
  `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`.
- Facilitator proof: N/A - Rosen rail, no x402 facilitator.

TokenMap evidence:

- TokenMap source:
  `{"rsUSDT":{"tokenId":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","decimals":6}}`
- TokenMap hash:
  `blake2b256:0x0f5b6a3b1f1e0afa6401a4cd058e77e52b2108b79e6551b633803efa59a7a0c9`
- Wrapped asset: `rsUSDT`
- Token id:
  `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`
- Decimals: `6`

Accounting evidence:

- Agreement price: `0.05 rsUSDT`.
- Expected base units: `50000`.
- Actual token amount on the stub Note: `50000`.
- Token amount matched: `true`.
- Wrong TokenMap rejection: `TOKEN_NOT_PRESENT`.

Bridge assumption review:

- Real dependencies: none.
- Stubbed dependencies: TokenMap source, Rosen wrapped-token Note box, and
  `redeemNote` settlement tx id.
- Unavailable dependencies: live Rosen testnet bridge, liquidity, and watcher
  evidence.
- Accord receipt validity is intentionally separated from Rosen bridge
  liveness in this architecture result.

Receipt validation:

- Agreement validation: pass.
- Verification Receipt validation: pass.
- Settlement Receipt validation: pass.
- Settlement Receipt references Verification Receipt: pass.

## Failure Classification

None.

## Rollback

- Funds recovered or expired: N/A - no live bridge, no real funds, no real
  Rosen liquidity used.
- Keys rotated: N/A - no private keys, bearer tokens, or bridge credentials
  were used.
- Pending Notes cancelled or documented: N/A - local stub Note only.
- Follow-up tests/issues: rerun with a live Rosen testnet TokenMap and bridge
  evidence when access is available; keep the wrong-TokenMap rejection
  expectation unchanged.

## Notes

- This pilot does not certify mainnet use.
- This result validates Accord's Rosen wrapped-token accounting architecture:
  caller-supplied TokenMap, decimals normalization, token amount verification,
  receipt binding, and failure on TokenMap mismatch.
- This result does not certify live Rosen bridge operation, liquidity, watcher
  behaviour, or any mainnet asset.
