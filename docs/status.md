# Status

This page is the single source of truth for what works, what does not work, and what can reach mainnet. Other docs MUST defer to this page when they conflict.

Last updated: 2026-05-11 — professionalization / trust-language sync.

## Executive summary

| Area | Status |
|---|---|
| Protocol object version | `v0` draft |
| SDK line | `0.4.0` release candidate |
| Conformance | L0-L4 implemented in the reference suite |
| Recommended usage | Local demos, mock rail, testnet development, conformance testing |
| Mainnet status | **NOT CERTIFIED FOR MAINNET** |
| Production use | Blocked until signed audit manifests mark relevant scripts/contracts `mainnetAllowed: true` |

Accord Protocol is alpha / testnet-first software. The repo may contain working code and testnet demos, but no Accord rail, Note/Reserve/Tracker script, ChainCash/Basis contract, or EVM contract is production-certified until the relevant signed audit manifests say so.

---

## Mainnet status

**`NOT CERTIFIED FOR MAINNET`.**

| Layer | Mainnet | Why |
|---|---|---|
| Ergo rail: Note / Reserve / Tracker via `@accord-protocol/rails-ergo` | Testnet only | `AUDITED_ERGOTREES.json` is `draft-pre-audit`; entries remain `mainnetAllowed: false` |
| Rosen rail via `@accord-protocol/rails-rosen` | Testnet only | Depends on the Ergo rail mainnet gate and bridge/liquidity assumptions |
| Base/EVM rail via `@accord-protocol/rails-base` | Testnet only | `AUDITED_CONTRACTS.json` is `draft-pre-audit`; entries are not mainnet-certified |
| x402 rail via `@accord-protocol/rails-x402` | Testnet / integration only | No on-chain manifest; trust depends on facilitator-signed payment proof and integration policy |
| ChainCash / Basis reference scripts | Reference / research / draft-pre-audit | Not a blanket production-safety guarantee |

The SDK enforces this with a two-gate guard in `assertProductionSafety()`:

1. **Box-shape gate** — refuses mainnet writes without a compiled `scriptErgoTree` on Ergo or a valid contract address on EVM, unless an explicit dangerous override is provided.
2. **Audit-identity gate** — refuses any tree/bytecode whose hash is not in the audited manifest with `mainnetAllowed: true`, unless an explicit dangerous override is provided.

Both gates should flip from default-deny to default-allow only when an external auditor signs the relevant manifest and the manifest entry is updated to `mainnetAllowed: true`. See [`SECURITY.md`](../SECURITY.md), [`docs/audit/`](./audit/), and [`docs/audit/SIGNING_PLAYBOOK.md`](./audit/SIGNING_PLAYBOOK.md) if present.

---

## Recommended usage today

Use Accord today for:

- local mock-rail demos;
- Ergo testnet experiments;
- x402-compatible HTTP payment architecture demos;
- MCP tool gating prototypes;
- conformance testing;
- protocol/schema review;
- audit preparation.

Do not use Accord today for:

- unaudited mainnet custody;
- production credit issuance;
- production Note redemption with real funds;
- customer-facing financial workflows;
- security claims that imply audit completion.

---

## Protocol-spec status

| Spec | Status |
|---|---|
| [`ACCORD-000`](../specs/ACCORD-000-overview.md) Overview | Draft |
| [`ACCORD-001`](../specs/ACCORD-001-agreement-object.md) Agreement Object | Draft |
| [`ACCORD-002`](../specs/ACCORD-002-verification-receipt.md) Verification Receipt | Draft |
| [`ACCORD-003`](../specs/ACCORD-003-settlement-receipt.md) Settlement Receipt | Draft |
| `ACCORD-004` Accord/402 Transport | Draft |
| `ACCORD-005` Accord/MCP Transport | Draft |
| `ACCORD-006` Rails | Draft |
| `ACCORD-007` Notes & Credit | Draft |
| `ACCORD-008` Registry | Draft |
| `ACCORD-009` Conformance | Draft |
| `ACCORD-010` Security & Audit | Draft |

Stable RFCs must ship matching JSON Schemas in [`schemas/`](../schemas/) and conformance tests before being treated as stable.

---

## SDK implementation status

### Accord Protocol layer (`@accord-protocol/*`, `0.4.0` release candidate)

| Package | State | What it does |
|---|---|---|
| [`@accord-protocol/core`](../packages/accord-core/) | Alpha — implemented | Canonicalize / hash / validate Agreement / Verification Receipt / Settlement Receipt |
| [`@accord-protocol/mcp`](../packages/accord-mcp/) | Alpha — implemented | Accord/MCP wrapper: paywalled tools and verification hooks |
| [`@accord-protocol/gateway`](../packages/accord-gateway/) | Alpha — implemented | Accord/402 HTTP middleware and 402 challenge flow |
| [`@accord-protocol/rails`](../packages/accord-rails/) | Alpha — implemented | Shared `AccordRailAdapter` interface and `MockRailAdapter` |
| [`@accord-protocol/rails-ergo`](../packages/accord-rails-ergo/) | Alpha — testnet only | Ergo Note rail and task-hash binding |
| [`@accord-protocol/rails-rosen`](../packages/accord-rails-rosen/) | Alpha — testnet only | Rosen-bridged stablecoin rail reference |
| [`@accord-protocol/rails-base`](../packages/accord-rails-base/) | Alpha — testnet only | Base/EVM Note rail reference |
| [`@accord-protocol/rails-x402`](../packages/accord-rails-x402/) | Alpha — integration only | x402-compatible facilitator adapter |
| [`@accord-protocol/conformance`](../packages/accord-conformance/) | Alpha — implemented | L0-L4 conformance suite and CLI |
| [`@accord-protocol/buyer-policy`](../packages/accord-buyer-policy/) | Alpha — implemented | Buyer-side policy engine for agentic wallets |

### Reference / legacy rail packages (`ergo-agent-*` / `agentpay-base`, `0.3.0` line)

These are maintained reference packages. They may be API-stable within the reference line, but they are **not production-certified** and do **not** imply mainnet safety.

| Package | State | What it does |
|---|---|---|
| [`ergo-agent-pay`](../packages/ergo-agent-pay/) | Maintained reference — testnet / not production-certified | Ergo Reserve / Note / Tracker SDK |
| [`ergo-agent-cli`](../packages/ergo-agent-cli/) | Maintained reference — testnet / not production-certified | CLI for Ergo Note lifecycle |
| [`ergo-agent-api`](../packages/ergo-agent-api/) | Legacy reference | Express middleware paywall predating Accord/402 |
| [`ergo-agent-mcp`](../packages/ergo-agent-mcp/) | Legacy reference | MCP server predating Accord/MCP |
| [`ergo-agent-server`](../packages/ergo-agent-server/) | Maintained reference | Local HTTP bridge daemon |
| [`ergo-agent-scripts`](../packages/ergo-agent-scripts/) | Draft-pre-audit | ErgoScript sources and audit manifests |
| [`ergo-agent-rosen`](../packages/ergo-agent-rosen/) | Maintained reference — testnet / not production-certified | Rosen bridge glue |
| [`agentpay-base`](../packages/agentpay-base/) | Maintained reference — testnet / not production-certified | Base/EVM Reserve + Note SDK |
| `ergo-agent-pay` Python | Maintained reference | Python read-side SDK and bridge client |

---

## Conformance status

| Level | Status | Meaning |
|---|---|---|
| L0 | Implemented | Schema-compatible |
| L1 | Implemented | Transport-compatible |
| L2 | Implemented | Rail-compatible against reference rails |
| L3 | Implemented | Security-compatible guardrail checks |
| L4 | Implemented | Registry-certified shape and cross-reference checks |

Conformance passing means an implementation matches current Accord v0 rules. It does **not** mean mainnet production safety or external audit completion.

---

## Example modes

| Path | Mode | Uses real funds? | Mainnet certified? |
|---|---|---:|---:|
| [`examples/15-paid-mcp-repo-audit/`](../examples/15-paid-mcp-repo-audit/) | Mock rail | No | No |
| [`examples/01-basic-payment/`](../examples/01-basic-payment/) | Ergo testnet | Testnet only | No |
| [`examples/02-note-payment/`](../examples/02-note-payment/) | Ergo testnet / architecture | Testnet only | No |
| [`examples/03-acceptance-predicate/`](../examples/03-acceptance-predicate/) | Ergo testnet / architecture | Testnet only | No |
| [`examples/05-api-payment-server/`](../examples/05-api-payment-server/) | Ergo testnet / architecture | Testnet only | No |
| [`examples/11-cross-chain-rosen/`](../examples/11-cross-chain-rosen/) | Rosen architecture / testnet-first | No | No |
| [`examples/12-paywalled-mcp/`](../examples/12-paywalled-mcp/) | Legacy MCP / testnet-first | Testnet only | No |
| [`examples/13-paywalled-langchain/`](../examples/13-paywalled-langchain/) | Legacy Ergo rail / testnet-first | Testnet only | No |
| [`examples/14-paywalled-crewai/`](../examples/14-paywalled-crewai/) | Legacy Ergo rail / testnet-first | Testnet only | No |

---

## Release status

| Item | State |
|---|---|
| Publish workflows | Present, but must be checked against current package matrix before tag |
| `NPM_TOKEN` GitHub secret | Configure before release |
| PyPI Trusted Publishing | Configure before release |
| `v0.4.0` tag | Do not push until release gates pass |
| GitHub Release | Create only after packages are published or intentionally marked local-only |

See [`PUBLISHING.md`](../PUBLISHING.md), [`RELEASING.md`](../RELEASING.md), and [`docs/RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md) if present.

---

## Open-source vs commercial

This repository contains the open standard and reference implementations:

- specs;
- schemas;
- test vectors;
- conformance suite;
- signing infrastructure;
- TypeScript and Python SDKs;
- reference rail adapters;
- audit manifests;
- examples;
- registry previews.

Commercial products such as hosted gateways, paid dashboards, enterprise integrations, managed verifier routing, private registries, and marketplace operations should live elsewhere, for example under future `agentaccord/*` repositories.
