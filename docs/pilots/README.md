# Testnet Pilot Runbooks

These files are runbooks, not completed pilot reports. They define how to run
controlled P4 pilots without changing the default-deny mainnet posture.

No pilot in this folder certifies mainnet use. Mainnet promotion still
requires signed external audit manifests with exact `mainnetAllowed: true`
entries.

## Pilot Matrix

| Pilot | Primary rail | Purpose | Runbook |
|---|---|---|---|
| Mock Accord/MCP paid tool | Mock | Verify the full agreement / verification / settlement lifecycle without chain risk | [`mock-mcp-paid-tool.md`](./mock-mcp-paid-tool.md) |
| Ergo testnet Note settlement | Ergo testnet | Prove example 16 against live testnet boxes and tx ids | [`ergo-testnet-note-settlement.md`](./ergo-testnet-note-settlement.md) |
| Rosen wrapped-token architecture | Rosen / Ergo testnet | Validate TokenMap, wrapped-token accounting, and bridge assumptions without mainnet claims | [`rosen-wrapped-token-architecture.md`](./rosen-wrapped-token-architecture.md) |
| Base Sepolia contract rail | Base Sepolia | Validate EVM Note shape and audit-gate behaviour on a testnet contract | [`base-sepolia-contract-rail.md`](./base-sepolia-contract-rail.md) |
| x402 facilitator integration | x402 | Validate facilitator proof handling and Accord receipts around HTTP payment flows | [`x402-facilitator-integration.md`](./x402-facilitator-integration.md) |

Use [`result-template.md`](./result-template.md) for every pilot result.

## Shared Rules

- Use fresh testnet credentials and low balances.
- Do not set dangerous mainnet override flags.
- Keep `docs/status.md` and `SECURITY.md` authoritative when any runbook
  appears to conflict with safety posture.
- Capture conformance output plus Agreement, Verification Receipt, and
  Settlement Receipt evidence for every completed pilot.
- Classify every failure as verifier, rail, settlement, wallet, bridge,
  facilitator, policy, or documentation.

## Exit Criteria

P4 is complete only when every pilot has:

- a completed result record;
- expected receipts or a documented reason the receipt was not emitted;
- rollback notes;
- links to testnet explorer evidence where applicable;
- at least one follow-up test or issue for each deterministic failure.
