# Pilot - x402 Facilitator Integration

## Goal

Validate Accord receipts around an x402-compatible HTTP payment flow.

## Scenario

An HTTP client receives a 402 challenge, pays through a facilitator, then
retries with facilitator proof. Accord records the Agreement, verifier result,
and Settlement Receipt around that payment proof.

## Preflight

```bash
npm install --include=optional
npm run build -w @accord-protocol/rails-x402
npm test -w @accord-protocol/rails-x402
npm run build -w @accord-protocol/gateway
npm test -w @accord-protocol/gateway
```

## Expected Receipts

| Receipt | Expected |
|---|---|
| Agreement | `rail: "x402"` and HTTP task terms |
| Verification Receipt | accepted only when response evidence is valid |
| Settlement Receipt | facilitator `payment_id` or equivalent proof id |
| Conformance | Accord/402 transport checks remain passing |

## Rollback Plan

- Use test facilitator credentials or a stub facilitator.
- Revoke any temporary facilitator keys after the pilot.
- If payment proof replay is observed, stop the pilot and add a gateway
  replay regression test.
- Do not describe facilitator trust as Accord mainnet certification.

## Pass Criteria

- 402 challenge headers are captured.
- Facilitator proof id is present in the Settlement Receipt.
- Replay and missing-payment cases fail closed.
