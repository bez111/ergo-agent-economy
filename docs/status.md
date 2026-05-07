# Status

This page is the single source of truth for "what works, what doesn't, what
can hit mainnet." Other docs MUST defer to this one when they conflict.

Last updated: 2026-05-07

## Mainnet status

**`NOT CERTIFIED FOR MAINNET`.**

| Layer | Mainnet status | Why |
|---|---|---|
| Protocol specs (`specs/ACCORD-*`) | Draft | v0 RFCs in flight; no breaking changes expected from approved drafts |
| Open-source SDKs (`@accord-protocol/*`) | Pre-alpha | Phase 4-6 of the open-source roadmap |
| Ergo rail (Reserve / Note / Tracker) | Testnet only | All audited-tree manifest entries are `mainnetAllowed: false` |
| Base/EVM rail (`agentpay-base`) | Testnet only | `AUDITED_CONTRACTS.json` is unsigned, `mainnetAllowed: false` |
| Rosen cross-chain rail | Testnet only | Depends on the Ergo rail's mainnet gate |
| x402 compatibility | Not implemented yet | Planned for v0.4.0-rails milestone |

The SDK enforces this with a **two-gate guard**:

1. **Box-shape gate** — refuses mainnet writes without a compiled
   `scriptErgoTree` (Ergo) or non-empty contract address (Base) unless an
   explicit `dangerouslyAllowInsecureMainnetP2PK: true` opt-in is set.
2. **Audit-identity gate** — refuses any tree/bytecode whose hash is not in
   the audited manifest with `mainnetAllowed: true`, unless an explicit
   `dangerouslyAllowUnauditedErgoTree: true` opt-in is set.

Both gates flip from default-deny to default-allow only when an external
auditor signs the relevant manifest and the entry's `mainnetAllowed` is set
to `true`. See [`SECURITY.md`](../SECURITY.md) and the
[`docs/audit/`](./audit/) folder for the auditor process.

## Implementation status

| Component | State | Lives in |
|---|---|---|
| BLAKE2b-256 task hash | Stable, golden vectors shared cross-language | `test-vectors/task-hash.json` |
| Ergo Note lifecycle (issue / redeem / settle batch) | Stable on testnet | `packages/ergo-agent-pay` |
| HTTP 402 / Note middleware | Stable on testnet | `packages/ergo-agent-api` |
| MCP paywall server + lifecycle tools | Stable | `packages/ergo-agent-mcp` |
| Local HTTP bridge daemon | Stable | `packages/ergo-agent-server` |
| Audited ErgoTree manifest + verifier | Stable, all entries `mainnetAllowed: false` | `packages/ergo-agent-scripts` |
| Rosen cross-chain (rsUSDT / rsUSDC) | Functional on testnet | `packages/ergo-agent-rosen` |
| Base/EVM Reserve + Note adapter | Functional on testnet | `packages/agentpay-base` |
| Python SDK (read-side + bridge client) | Stable | `packages/ergo-agent-py` |
| LangChain / CrewAI / MCP examples | Working with mock NOTE_BOX_ID | `examples/13-paywalled-langchain`, `examples/14-paywalled-crewai`, `examples/12-paywalled-mcp` |

## Open-source vs commercial

This repo contains the **open standard** and reference implementations only:

- Specs (`specs/ACCORD-*`)
- Schemas, test vectors, conformance tests
- TypeScript and Python SDKs
- Reference rail adapters (Ergo, Rosen, Base, x402)
- ErgoScript / Solidity contracts
- Audit manifests and audit-identity verifiers
- Examples

**Commercial products** — hosted gateway, marketplace, verifier routing,
private registries, enterprise dashboards — live in `agentaccord/*` repos
and are out of scope here.

The open / commercial boundary is documented in
[`docs/strategy/open-core-model.md`](./strategy/open-core-model.md) (TBD).
