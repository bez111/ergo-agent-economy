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

## Evidence To Capture

- Full Agreement JSON and `agreement_hash`.
- Full Verification Receipt JSON and `receipt_id`.
- Full Settlement Receipt JSON with facilitator `payment_id` or tx hash.
- Redacted HTTP 402 challenge headers, including accepted rail and payment
  requirements.
- Redacted retry request headers proving the facilitator proof was supplied.
- Facilitator verify/settle response with secrets removed.
- Replay test output showing the same payment proof fails closed.
- Conformance output showing the current achieved level or documented failure.

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
