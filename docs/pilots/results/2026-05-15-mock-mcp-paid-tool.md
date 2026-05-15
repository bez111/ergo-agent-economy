# Pilot Result - Mock Accord/MCP Paid Tool

## Summary

| Field | Value |
|---|---|
| Pilot | Mock Accord/MCP paid tool |
| Date | 2026-05-15 |
| Operator | Codex local run |
| Git commit | `d229b44a9e8e58559d149d27da23b055facd1094` |
| Network | Local mock rail |
| Result | `pass` |

## Scenario

- User story: buyer pays for the repo-audit MCP tool and receives a structured audit report.
- Rail: `mock`.
- Tool or endpoint: `accord-paid-mcp-repo-audit-demo`.
- Buyer identity: local demo buyer.
- Seller identity: local demo seller.
- Verifier identity: local demo verifier.

## Commands

```bash
npm run release:preflight -- --allow-branch --pack
npm test -w accord-paid-mcp-repo-audit-demo
npm run dev -w accord-paid-mcp-repo-audit-demo
node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4
```

Command evidence:

- `npm run release:preflight -- --allow-branch --pack`: all 14 gates passed, including 675 tests, conformance L4, demo, 18 package tarballs, and install-in-tempdir smoke.
- `npm test -w accord-paid-mcp-repo-audit-demo`: 3 tests passed, 0 failed.
- `npm run dev -w accord-paid-mcp-repo-audit-demo`: demo exited 0 and emitted Agreement, Verification Receipt, and Settlement Receipt.
- `node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4`: Achieved L4.

## Expected Receipts

| Receipt | Required? | Expected evidence |
|---|---:|---|
| Agreement | Yes | `agreement_id`, `agreement_hash` |
| Verification Receipt | Yes | `receipt_id`, verifier id, result |
| Settlement Receipt | Yes | `settlement_id`, rail payment id |
| Conformance Result | Yes | L0-L4 pass output |

## Observed Receipts

```json
{
  "agreement_id": "acc_01HX0DEMO00000000000000000",
  "agreement_hash": "blake2b256:0x512cd83824156d7dbfe2e8d104df13835dd4c2182dafcc2699d97fdb9fa63c1a",
  "verification_receipt_id": "vr_564Z5HWPPN073R9C40KJYGRJ5V",
  "settlement_receipt_id": "sr_6WR5V7KQ6T6EVXX79E4VQ8WDRJ",
  "settlement_tx_id": "N/A - local mock rail accepted payment shape without a chain transaction",
  "conformance_result": "Achieved: L4"
}
```

## Explorer / External Evidence

- Reserve tx: N/A - no chain access.
- Reserve box: N/A - no chain access.
- Note tx: N/A - no chain access.
- Note box: N/A - no chain access.
- Settlement tx: N/A - local mock rail only.
- Facilitator proof: N/A - no x402 facilitator.

## Failure Classification

None.

## Rollback

- Funds recovered or expired: N/A - no funds used.
- Keys rotated: N/A - no private keys or credentials used.
- Pending Notes cancelled or documented: N/A - no Notes created.
- Follow-up tests/issues: no deterministic failure found; existing demo tests cover lifecycle completion, structured report output, and unique agreements per call.

## Notes

- This pilot does not certify mainnet use.
- The mock rail validates the Accord/MCP lifecycle shape only: Agreement, mock payment verification, tool execution, Verification Receipt, and Settlement Receipt.
