# npm and PyPI publication evidence - 2026-05-15

This record captures the package publication state after the `v0.4.1` npm
workflow recovery.

## Summary

- GitHub Actions npm run:
  [publish-npm.yml run 25936777585](https://github.com/accord-protocol/accord-protocol/actions/runs/25936777585)
- Verified commit: `e42de427235ef205df05351fb51e607b159d23b6`
- npm verification command: `npm run npm:publish-status`
- npm result: 18/18 package version(s) already published; 0 pending
- PyPI verification command: `python3 -m pip index versions ergo-agent-pay`
- PyPI result: `ergo-agent-pay (0.3.1)` with available versions `0.3.1`, `0.3.0`

## Published npm packages

### Accord packages at `0.4.1`

- `@accord-protocol/core`
- `@accord-protocol/mcp`
- `@accord-protocol/gateway`
- `@accord-protocol/rails`
- `@accord-protocol/rails-ergo`
- `@accord-protocol/rails-rosen`
- `@accord-protocol/rails-base`
- `@accord-protocol/rails-x402`
- `@accord-protocol/conformance`
- `@accord-protocol/buyer-policy`

### Maintained reference packages at `0.3.1`

- `ergo-agent-pay`
- `ergo-agent-cli`
- `ergo-agent-api`
- `ergo-agent-mcp`
- `ergo-agent-server`
- `ergo-agent-scripts`
- `ergo-agent-rosen`
- `agentpay-base`

## Published PyPI package

- `ergo-agent-pay==0.3.1`

## Mainnet non-certification

Package publication does not change Accord's safety posture. The source of truth
remains [`docs/status.md`](../status.md), and Accord remains **NOT CERTIFIED FOR
MAINNET** until external audit evidence updates the relevant signed manifests
with exact `mainnetAllowed: true` entries.

See also:

- [`docs/PACKAGE_MATRIX.md`](../PACKAGE_MATRIX.md)
- [`docs/RELEASE-CHECKLIST.md`](../RELEASE-CHECKLIST.md)
- [`SECURITY.md`](../../SECURITY.md)
- [`docs/pilots/EXTERNAL_INPUTS.md`](../pilots/EXTERNAL_INPUTS.md)

## Remaining 1.0.0 blockers

- Run the two pending external P4 testnet pilots.
- Upgrade the Sage Ergo testnet result from `inconclusive` to `pass` after the
  public Sage receipt/activity surfaces expose signed Accord receipt JSON.
- Rerun the x402 result against a live test facilitator if project policy
  requires non-stub facilitator evidence before `1.0.0`.
- Archive pilot evidence with dated result records.
- Obtain external audit reports.
- Sign and publish manifests for any artifact that will ever be allowed on
  mainnet.
