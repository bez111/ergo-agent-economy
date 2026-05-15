# Pilot - Rosen Wrapped-Token Architecture

## Goal

Validate the Rosen wrapped-token rail assumptions without claiming mainnet
certification.

## Scenario

The operator uses
[`examples/11-cross-chain-rosen`](../../examples/11-cross-chain-rosen/) as an
architecture walkthrough, then validates reusable logic through
`ergo-agent-rosen` and `@accord-protocol/rails-rosen` tests.

## Preflight

```bash
npm install --include=optional
npm run build -w ergo-agent-rosen
npm test -w ergo-agent-rosen
npm run build -w @accord-protocol/rails-rosen
npm test -w @accord-protocol/rails-rosen
npm run pilots:rosen:stub
```

## Expected Receipts

| Receipt | Expected |
|---|---|
| Agreement | `rail: "rosen"` and wrapped-token currency such as `rsUSDT` |
| Verification Receipt | accepted only after tool output satisfies verifier policy |
| Settlement Receipt | token amount checked against caller-supplied Rosen token registry |
| Conformance | rail compatibility remains passing against the reference Rosen rail |

## Evidence To Capture

- Full Agreement JSON and `agreement_hash`.
- Full Verification Receipt JSON and `receipt_id`.
- Full Settlement Receipt JSON and `settlement_id`.
- Test TokenMap source, hash, token id, wrapped asset symbol, and decimals.
- Wrapped-token accounting evidence showing the expected amount and actual
  Note value agree after decimals normalization.
- Bridge assumption review naming which Rosen dependency was real, stubbed, or
  unavailable.
- Conformance output showing the current achieved level, or the exact reason
  conformance does not apply to the architectural run.

## Rollback Plan

- Do not bridge mainnet assets for this pilot.
- If a TokenMap mismatch appears, stop the run and pin the observed TokenMap
  version in the result record.
- If wrapped-token accounting differs from expectations, add a rails-rosen
  adapter regression test before rerunning.

## Pass Criteria

- Token ids and decimals come from an explicit testnet TokenMap or stub.
- No baked mainnet token constants are introduced.
- Bridge assumptions are documented separately from Accord receipt validity.
