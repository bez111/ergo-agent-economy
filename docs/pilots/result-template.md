# Pilot Result Template

Copy this file into a dated pilot result before running a pilot. Do not store
private keys, mnemonics, bearer tokens, or signed transaction payloads.

## Summary

| Field | Value |
|---|---|
| Pilot | |
| Date | |
| Operator | |
| Git commit | |
| Network | |
| Result | `pass` / `fail` / `inconclusive` |

## Scenario

- User story:
- Rail:
- Tool or endpoint:
- Buyer identity:
- Seller identity:
- Verifier identity:

## Commands

```bash
npm install --include=optional
npm run build
npm run typecheck
npm run release:check
npm run audit:check
npm run site:check
```

Add pilot-specific commands below this block.

## Expected Receipts

| Receipt | Required? | Expected evidence |
|---|---:|---|
| Agreement | Yes | `agreement_id`, `agreement_hash` |
| Verification Receipt | Yes | `receipt_id`, verifier id, result |
| Settlement Receipt | Yes | `settlement_id`, rail, tx id or payment id |
| Conformance Result | Yes | command output or signed JSON |

## Observed Receipts

```json
{
  "agreement_id": "",
  "agreement_hash": "",
  "verification_receipt_id": "",
  "settlement_receipt_id": "",
  "settlement_tx_id": "",
  "conformance_result": ""
}
```

## Explorer / External Evidence

- Reserve tx:
- Reserve box:
- Note tx:
- Note box:
- Settlement tx:
- Facilitator proof:

## Failure Classification

Choose one or more:

- verifier
- rail
- settlement
- wallet
- bridge
- facilitator
- policy
- documentation

## Rollback

- Funds recovered or expired:
- Keys rotated:
- Pending Notes cancelled or documented:
- Follow-up tests/issues:

## Notes

-
