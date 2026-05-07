# Status

This page is the single source of truth for "what works, what doesn't, what
can hit mainnet." Other docs MUST defer to this one when they conflict.

Last updated: 2026-05-07 — post v0.4.0 release-candidate truth sync

## Mainnet status

**`NOT CERTIFIED FOR MAINNET`.**

| Layer | Mainnet | Why |
|---|---|---|
| Ergo rail (Note / Reserve / Tracker via `@accord-protocol/rails-ergo`) | Testnet only | `AUDITED_ERGOTREES.json` `draft-pre-audit`; every entry `mainnetAllowed: false` |
| Rosen rail (rsUSDT/rsUSDC/rsBTC via `@accord-protocol/rails-rosen`) | Testnet only | Depends on the Ergo rail's mainnet gate |
| Base/EVM rail (`@accord-protocol/rails-base`) | Testnet only | `AUDITED_CONTRACTS.json` `draft-pre-audit`; `entries: []` (gate refuses by default) |
| x402 rail (`@accord-protocol/rails-x402`) | Testnet only | No on-chain manifest; trust derives from facilitator-signed payment proof |

The SDK enforces this with a **two-gate guard** in `assertProductionSafety()`:

1. **Box-shape gate** — refuses mainnet writes without a compiled
   `scriptErgoTree` (Ergo) or non-empty contract address (Base) unless an
   explicit `dangerouslyAllowInsecureMainnetP2PK: true` opt-in is set.
2. **Audit-identity gate** — refuses any tree/bytecode whose hash is not in
   the audited manifest with `mainnetAllowed: true`, unless an explicit
   `dangerouslyAllowUnauditedErgoTree: true` opt-in is set.

Both gates flip from default-deny to default-allow only when an external
auditor signs the relevant manifest and the entry's `mainnetAllowed` is set
to `true`. See [`SECURITY.md`](../SECURITY.md), the
[`docs/audit/`](./audit/) folder, and the
[audit signing playbook](./audit/SIGNING_PLAYBOOK.md).

## Protocol-spec status

| Spec | Status |
|---|---|
| [`ACCORD-000`](../specs/ACCORD-000-overview.md) Overview | Draft |
| [`ACCORD-001`](../specs/ACCORD-001-agreement-object.md) Agreement Object | Draft |
| [`ACCORD-002`](../specs/ACCORD-002-verification-receipt.md) Verification Receipt | Draft |
| [`ACCORD-003`](../specs/ACCORD-003-settlement-receipt.md) Settlement Receipt | Draft |
| `ACCORD-004` Accord/402 Transport | Draft (PR-044) |
| `ACCORD-005` Accord/MCP Transport | Draft (PR-044) |
| `ACCORD-006` Rails | Draft (PR-044) |
| `ACCORD-007` Notes & Credit | Draft (PR-044) |
| `ACCORD-008` Registry | Draft (PR-044) |
| `ACCORD-009` Conformance | Draft (PR-044) |
| `ACCORD-010` Security & Audit | Draft (PR-044) |

Stable RFCs ship matching JSON Schemas in [`schemas/`](../schemas/) and
conformance tests in `@accord-protocol/conformance` before each SDK release.

## SDK implementation status

### Accord Protocol layer (`@accord-protocol/*`, version 0.4.0)

| Package | State | What it does |
|---|---|---|
| [`@accord-protocol/core`](../packages/accord-core/) | **Alpha — implemented** | Canonicalize / hash / validate Agreement / Verification Receipt / Settlement Receipt |
| [`@accord-protocol/mcp`](../packages/accord-mcp/) | **Alpha — implemented** | Accord/MCP wrapper: paywalled tools, validates agreement, verifies payment, optional verifier hook |
| [`@accord-protocol/gateway`](../packages/accord-gateway/) | **Alpha — implemented** | Accord/402 HTTP middleware (Connect/Express): 402 challenge, replay-protected payment verification |
| [`@accord-protocol/rails`](../packages/accord-rails/) | **Alpha — implemented** | Shared `AccordRailAdapter` interface + `MockRailAdapter` for tests/demos |
| [`@accord-protocol/rails-ergo`](../packages/accord-rails-ergo/) | **Alpha — implemented (testnet)** | Ergo Note rail: blake2b256 task-hash, R6 binding, redeemNote |
| [`@accord-protocol/rails-rosen`](../packages/accord-rails-rosen/) | **Alpha — implemented (testnet)** | Rosen-bridged stablecoin rail (rsUSDT/rsUSDC/rsBTC) |
| [`@accord-protocol/rails-base`](../packages/accord-rails-base/) | **Alpha — implemented (testnet)** | Base/EVM Note rail: keccak256, AgentPayReserveV0 |
| [`@accord-protocol/rails-x402`](../packages/accord-rails-x402/) | **Alpha — implemented** | x402-compatible rail (any facilitator: Coinbase, self-hosted, custom) |
| [`@accord-protocol/conformance`](../packages/accord-conformance/) | **Alpha — implemented (L0–L4)** | Conformance suite + CLI: `run` / `keygen` / `sign` / `verify`. Network mode (HTTP + MCP-stdio) |

### Reference / legacy rail packages (`ergo-agent-*` / `agentpay-base`, version 0.3.0)

These are the original Ergo-focused implementations that the Accord layer is
built on top of. They remain published and supported — the Accord rail
adapters delegate transaction-building to them.

| Package | State | What it does |
|---|---|---|
| [`ergo-agent-pay`](../packages/ergo-agent-pay/) | Stable | Ergo Reserve / Note / Tracker SDK |
| [`ergo-agent-cli`](../packages/ergo-agent-cli/) | Stable | CLI for Ergo Note lifecycle |
| [`ergo-agent-api`](../packages/ergo-agent-api/) | Stable | Express middleware paywall (legacy 402 shape) |
| [`ergo-agent-mcp`](../packages/ergo-agent-mcp/) | Stable | MCP server + lifecycle tools |
| [`ergo-agent-server`](../packages/ergo-agent-server/) | Stable | Local HTTP bridge daemon |
| [`ergo-agent-scripts`](../packages/ergo-agent-scripts/) | Stable | ErgoScript sources + audited tree manifest |
| [`ergo-agent-rosen`](../packages/ergo-agent-rosen/) | Stable (testnet) | Rosen Bridge cross-chain glue |
| [`agentpay-base`](../packages/agentpay-base/) | Stable (testnet) | Solidity Reserve + Note SDK on Base/EVM |
| `ergo-agent-pay` (Python) | Stable | Python read-side + bridge client (PyPI: `ergo-agent-pay`) |

## Conformance status

| Level | Status | Checks (runtime) |
|---|---|---|
| **L0** Schema-compatible | **PASS** | 20/20 |
| **L1** Transport-compatible (in-process) | **PASS** | 13/13 |
| **L1** Transport (HTTP via `--target <url>`) | Implemented | per-request |
| **L1** Transport (MCP-stdio via `--target stdio:<cmd>`) | Implemented | 4/4 against stub |
| **L2** Rail-compatible (4 reference rails) | **PASS** | 24/24 |
| **L3** Security-compatible (assertProductionSafety + verifyAudited*) | **PASS** | 12/12 |
| **L4** Registry-certified (registry/ shape + cross-references) | **PASS** | 13/13 |
| **Total** | **Achieved: L4** | **82** |

ed25519 signing infrastructure is in place — `accord-conformance sign` /
`verify` work on any Accord JSON object (Agreement, Receipt, conformance
result, audit manifest). See
[`packages/accord-conformance/README.md`](../packages/accord-conformance/README.md)
and [`docs/audit/SIGNING_PLAYBOOK.md`](./audit/SIGNING_PLAYBOOK.md).

## Examples

| Path | What it shows |
|---|---|
| [`examples/15-paid-mcp-repo-audit/`](../examples/15-paid-mcp-repo-audit/) | **Canonical no-placeholder demo** — full Accord lifecycle in <10 minutes (Agreement → Mock-rail payment → MCP wrapper → handler → verifier → both receipts) |
| [`examples/13-paywalled-langchain/`](../examples/13-paywalled-langchain/) | LangChain BaseTool paywalled by an Ergo Note (legacy rail; uses `ergo-agent-pay`) |
| [`examples/14-paywalled-crewai/`](../examples/14-paywalled-crewai/) | CrewAI counterpart with shared `PaymentPolicy` across the crew |
| [`examples/12-paywalled-mcp/`](../examples/12-paywalled-mcp/) | Paywalled MCP server using legacy `ergo-agent-mcp` |

## Release status

| Item | State |
|---|---|
| `publish-npm.yml` covers all 17 packages (9 Accord layer + 8 legacy) | **DONE** |
| Skip-if-already-published guard on every job | **DONE** |
| Self-conformance gate (L0+L1+L2+L3+L4) before publishing `@accord-protocol/conformance` | **DONE** |
| `NPM_TOKEN` GitHub secret | NOT SET — see [`docs/RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md) |
| PyPI Trusted Publishing | NOT CONFIGURED — see [`docs/RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md) |
| `v0.4.0` tag pushed | NOT YET — gated on the two items above |

## Open-source vs commercial

This repo contains the **open standard** and reference implementations only:

- Specs (`specs/ACCORD-*`)
- Schemas, test vectors, conformance tests, signing infrastructure
- TypeScript and Python SDKs
- Reference rail adapters (Ergo, Rosen, Base, x402)
- ErgoScript / Solidity contracts
- Audit manifests and audit-identity verifiers
- Examples
- Public registry preview (`registry/`)

**Commercial products** — hosted gateway, marketplace, verifier routing,
private registries, enterprise dashboards — live elsewhere (in
`agentaccord/*` repos when they exist) and are out of scope here.
