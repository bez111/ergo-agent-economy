# Pilot - Mock Accord/MCP Paid Tool

## Goal

Validate the complete Accord/MCP lifecycle without chain access: Agreement,
mock payment verification, handler execution, Verification Receipt, and
Settlement Receipt.

## Scenario

The buyer calls the repo-audit MCP tool in
[`examples/15-paid-mcp-repo-audit`](../../examples/15-paid-mcp-repo-audit/).
The mock rail accepts the payment shape and returns a valid Settlement Receipt.

## Preflight

```bash
npm install --include=optional
npm run build
npm run typecheck
npm test -w accord-paid-mcp-repo-audit-demo
npm run dev -w accord-paid-mcp-repo-audit-demo
```

## Expected Receipts

| Receipt | Expected |
|---|---|
| Agreement | `accord.agreement.v0` with `rail: "mock"` |
| Verification Receipt | accepted repo-audit report |
| Settlement Receipt | settled mock payment id |
| Conformance | L0-L4 still passes for the repo |

## Evidence To Capture

- Full Agreement JSON and `agreement_hash`.
- Full Verification Receipt JSON and `receipt_id`.
- Full Settlement Receipt JSON and `settlement_id`.
- Terminal transcript showing the paid MCP demo exited 0.
- Conformance output showing the current achieved level.

## Rollback Plan

No funds or external services are used. If the pilot fails, keep the failing
Agreement / receipt JSON, classify the error, and add a regression test before
rerunning.

## Pass Criteria

- Demo exits 0.
- Agreement hash is stable across repeated identical inputs.
- Verification and Settlement Receipts validate with `@accord-protocol/core`.
- No mainnet or testnet credentials are required.
