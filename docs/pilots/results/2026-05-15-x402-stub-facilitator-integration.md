# Pilot Result - x402 Stub Facilitator Integration

## Summary

| Field | Value |
|---|---|
| Pilot | x402 facilitator integration |
| Date | 2026-05-15 |
| Operator | Codex local x402 stub run |
| Git commit | `abe820e8e61e55292c31dbbf76f1af34d8f28076` |
| Network | Base Sepolia local stub |
| Result | `pass` |

## Scenario

- User story: an HTTP buyer receives a 402 challenge, retries with an x402
  payment proof, receives a verified premium response, and a replay attempt
  fails closed.
- Rail: `x402`.
- Tool or endpoint: `scripts/run-x402-stub-pilot.mjs`.
- Buyer identity: `agent://x402-stub-buyer`.
- Seller identity: `provider://accord-x402-stub-seller`.
- Verifier identity: `verifier://x402-stub-v0`.

## Commands

```bash
npm run build -w @accord-protocol/core
npm run build -w @accord-protocol/rails
npm run build -w @accord-protocol/gateway
npm run build -w @accord-protocol/rails-x402
npm test -w @accord-protocol/rails-x402
npm test -w @accord-protocol/gateway
npm run pilots:x402:stub
node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4
npm run release:check
npm run site:check
```

Command evidence:

- `npm test -w @accord-protocol/rails-x402`: 12 tests passed, 0 failed.
- `npm test -w @accord-protocol/gateway`: 16 tests passed, 0 failed.
- `npm run pilots:x402:stub`: emitted a passing evidence JSON with 402
  challenge, paid call, replay rejection, facilitator proof, and receipt checks.
- `node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4`:
  Achieved L4.
- `npm run release:check`: passed.
- `npm run site:check`: passed.

## Expected Receipts

| Receipt | Required? | Expected evidence |
|---|---:|---|
| Agreement | Yes | `agreement_id`, `agreement_hash`, `rail: "x402"` |
| Verification Receipt | Yes | `receipt_id`, verifier id, accepted result |
| Settlement Receipt | Yes | `settlement_id`, facilitator payment id or tx hash |
| Conformance Result | Yes | L0-L4 output |

## Observed Receipts

```json
{
  "agreement_id": "acc_x402_stub_20260515",
  "agreement_hash": "blake2b256:0xcb58931c7fefa348f54cca890851dca33c2d242aeeb40eba5918b6d3ec051baf",
  "verification_receipt_id": "vr_WK3Z2CYWT7QJ1NXF00810N7BDY",
  "settlement_receipt_id": "sr_EYE3R9F7412P3Z244W5XSXBJVZ",
  "settlement_tx_id": "0x3be0898d2d2456dae993a1ef2b152ba4c53a5d72a26da4a8c926f524b962e80f",
  "conformance_result": "Achieved: L4"
}
```

## Explorer / External Evidence

- Reserve tx: N/A - x402 pay-before-response flow, no Note Reserve.
- Reserve box: N/A - x402 pay-before-response flow, no Note Reserve.
- Note tx: N/A - x402 pay-before-response flow, no Note.
- Note box: N/A - x402 pay-before-response flow, no Note.
- Settlement tx: local stub tx hash
  `0x3be0898d2d2456dae993a1ef2b152ba4c53a5d72a26da4a8c926f524b962e80f`.
- Facilitator proof: redacted local stub proof
  `stub-x40...redacted`; facilitator returned payment id
  `0xd461e038872fb16baef6797413bbedfb4b3573607c18c4bbb130b60f06047e16`.

HTTP evidence:

- Initial call returned HTTP 402 with `www-authenticate: Accord402`,
  `accord-agreement-required: true`, and `accord-accepted-rails: x402`.
- Paid retry returned HTTP 200 with `x-accord-agreement-hash`,
  `x-accord-verification-receipt-hash`, and
  `x-accord-settlement-receipt-hash`.
- Replay retry returned HTTP 402 with `REPLAY_DETECTED`.

Receipt validation:

- Agreement validation: pass.
- Verification Receipt validation: pass.
- Settlement Receipt validation: pass.
- Settlement Receipt references Verification Receipt: pass.

## Failure Classification

None.

## Rollback

- Funds recovered or expired: N/A - no live facilitator or real funds used.
- Keys rotated: N/A - no private keys, bearer tokens, or facilitator secrets
  were used.
- Pending Notes cancelled or documented: N/A - x402 flow used no Notes.
- Follow-up tests/issues: rerun this pilot against a live test facilitator when
  credentials are available; keep the replay-fail expectation unchanged.

## Notes

- This pilot does not certify mainnet use.
- This result validates Accord's x402 HTTP lifecycle against a local stub
  facilitator: challenge, paid retry, verification receipt, settlement receipt,
  and replay rejection.
- This result does not certify any live facilitator, hosted Coinbase endpoint,
  production settlement service, or mainnet payment rail.
