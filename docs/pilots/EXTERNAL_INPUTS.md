# P4 External Inputs

P4 cannot be completed from repository code alone. These inputs must come from
operators, testnet services, facilitators, bridge maintainers, or auditors.

Do not mark a pilot as complete unless the dated result record contains the
evidence listed here. Missing evidence should remain a pending pilot, not a
mock pass.

## Ergo Testnet Note Settlement

Needed before running:

- fresh buyer and seller Ergo testnet wallets;
- low testnet ERG balance for the buyer;
- signer wiring in `examples/16-paid-mcp-ergo-testnet/common/setup.ts`;
- Reserve creation transaction id and Reserve box id;
- Note issuance transaction id and Note box id;
- settlement redemption transaction id;
- explorer links for Reserve, Note, and settlement;
- conformance output for L0-L4 or documented failure.

Local readiness commands:

```bash
npm run preflight -w accord-paid-mcp-ergo-testnet-demo -- --reserve-setup
npm run setup:reserve -w accord-paid-mcp-ergo-testnet-demo
npm run preflight -w accord-paid-mcp-ergo-testnet-demo
npm run dev -w accord-paid-mcp-ergo-testnet-demo
```

## Rosen Wrapped-Token Architecture

Needed before completing:

- test TokenMap source and hash;
- wrapped-token accounting evidence;
- bridge assumption review;
- failure classification for any missing bridge or liquidity dependency;
- conformance output or documented reason conformance does not apply yet.

This pilot is allowed to remain architectural until live Rosen testnet bridge
access is available. It must not introduce baked mainnet token constants.

## Base Sepolia Contract Rail

Needed before running:

- Base Sepolia RPC endpoint;
- funded Base Sepolia signer;
- deployed test contract address or deployment transaction;
- testnet transaction proving reserve/note/settlement shape;
- audit-gate output for the test contract;
- conformance output or documented failure.

No `AUDITED_CONTRACTS.json` entry may be promoted to `mainnetAllowed: true`
from this pilot.

## x402 Facilitator Integration

Local stub evidence is archived in
[`results/2026-05-15-x402-stub-facilitator-integration.md`](./results/2026-05-15-x402-stub-facilitator-integration.md).
The inputs below are only required for a live facilitator rerun.

Needed before running:

- test facilitator credentials or a local stub facilitator;
- HTTP payment challenge/response transcript;
- facilitator proof payload;
- Accord Agreement hash linking the paid request to the work;
- Verification Receipt and Settlement Receipt evidence;
- failure classification for facilitator or payment-proof errors.

The facilitator must not be described as trusted or mainnet-certified by
default.

## Auditor Inputs For P5

P5 remains blocked until external audit reports and signed manifests exist.

Required before any controlled mainnet promotion:

- external audit report for the exact script or contract hash;
- signed `AUDITED_ERGOTREES.json` or `AUDITED_CONTRACTS.json` update;
- exact `mainnetAllowed: true` entries only for audited artifacts;
- release note naming the audited rail and excluded rails;
- incident contact and rollback process.
