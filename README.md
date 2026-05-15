# Accord Protocol

[![CI](https://github.com/accord-protocol/accord-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/accord-protocol/accord-protocol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![mainnet: not certified](https://img.shields.io/badge/mainnet-not%20certified-red.svg)](./SECURITY.md)
[![status: testnet beta](https://img.shields.io/badge/status-testnet%20beta-orange.svg)](./docs/status.md)

**Accord Protocol is an open standard for autonomous agent work agreements.**

> **x402 verifies payment. Accord verifies completion.**

Accord turns paid requests into explicit work agreements: what was promised, who pays, how payment is authorized, how work is verified, and how settlement is recorded. It is rail-agnostic and ships reference adapters for Ergo, Rosen, Base/EVM, and x402-compatible HTTP payment flows.

Accord Protocol is the open standard. **AgentAccord** may build commercial infrastructure on top of it, but this repository contains the open specs, schemas, conformance tests, reference SDKs, rail adapters, examples, and audit-gated manifests.

```text
MCP        -> how agents call tools.
A2A        -> how agents talk.
x402 / AP2 -> how payment or payment authority can be expressed.
Accord     -> how work terms, verification, and settlement are recorded.
Ergo       -> the first reference programmable-settlement rail.
```

---

## Current status

| Area | Status |
|---|---|
| Protocol object version | `v0` draft |
| SDK line | `0.4.0` release candidate |
| Recommended usage | Local demos, mock rail, conformance testing, Ergo testnet |
| Mainnet status | **NOT CERTIFIED FOR MAINNET** |
| Production use | Blocked until signed audit manifests mark relevant scripts/contracts `mainnetAllowed: true` |
| Source of truth | [`docs/status.md`](./docs/status.md) |
| Compatibility policy | [`docs/PROTOCOL_COMPATIBILITY.md`](./docs/PROTOCOL_COMPATIBILITY.md) |

This is **alpha / testnet-first software**. Do not put real funds or production customer workflows behind unaudited Accord, ChainCash/Basis, Note, Reserve, Tracker, or Acceptance Predicate contracts.

---

## What Accord is

Accord records three core protocol objects:

| Object | Answers | Spec |
|---|---|---|
| **Accord Agreement** | What was promised, by whom, for how much, under which verification rules? | [`specs/ACCORD-001`](./specs/ACCORD-001-agreement-object.md) |
| **Verification Receipt** | Did a verifier accept, reject, or partially accept the work? | [`specs/ACCORD-002`](./specs/ACCORD-002-verification-receipt.md) |
| **Settlement Receipt** | Did the economic part settle, on which rail, with what proof or transaction? | [`specs/ACCORD-003`](./specs/ACCORD-003-settlement-receipt.md) |

A complete Accord flow can look like this:

```text
Agreement -> Payment proof -> Work execution -> Verification Receipt -> Settlement Receipt
```

Versioning and compatibility rules for v0 objects, schemas, conformance levels,
and registry semantics live in [`docs/PROTOCOL_COMPATIBILITY.md`](./docs/PROTOCOL_COMPATIBILITY.md).

---

## What Accord is not

Accord is not:

- a bank, broker, custodian, wallet, or money transmitter;
- a replacement for x402, AP2, Stripe, card networks, or stablecoin rails;
- a guarantee that work is correct without verifier design;
- production-certified mainnet infrastructure;
- controlled by AgentAccord;
- a promise that every rail has identical security assumptions.

x402 is strong for HTTP payment challenges and payment verification. AP2-style mandates are useful for authorization and accountability. Stripe and similar providers are strong for merchant commerce and buyer-authorized flows. **Accord adds the work-agreement layer: terms, verification receipts, and settlement receipts.**

---

## Why Ergo is the first reference rail

Ergo is the first end-to-end reference settlement rail because its eUTXO model, ErgoScript, native tokens, Sigma Protocols, PoW finality, and Babel-fee-style fee abstraction make it unusually suitable for programmable work settlement.

Accord does **not** claim that Ergo is the only possible rail. Accord is rail-agnostic. The Ergo rail is the first reference implementation because it can naturally express:

| Primitive | Purpose |
|---|---|
| **Reserve** | Collateral UTxO backing a credit / Note system |
| **Note** | Programmable bearer IOU used as a payment instrument |
| **Tracker** | Anti-double-spend or accounting state for Notes |
| **Acceptance Predicate** | Script condition that binds payment redemption to a task result or verifier proof |

Important caveats:

- eUTXO avoids several common account-model failure modes, including protocol-level reentrancy patterns and some state-race surprises. It does **not** make all MEV-like, oracle, bridge, DEX, verifier, wallet, or economic attacks impossible.
- Babel-fee-style flows can reduce native-token bootstrapping when a supported fee-conversion path exists. They are **not** a guarantee that every token is always accepted everywhere.
- The Ergo Note / Reserve / Tracker / Acceptance Predicate stack is **not production-certified** until relevant manifests are externally audited and signed.

---

## ChainCash / Basis reference status

ChainCash / Basis is the reference credit-system implementation that inspired the Reserve + Note + Tracker design space. Accord treats ChainCash/Basis scripts and vendored manifests as **reference / research / draft-pre-audit** material, not as a blanket production-safety guarantee.

Always check:

- [`docs/status.md`](./docs/status.md)
- [`SECURITY.md`](./SECURITY.md)
- [`docs/audit/`](./docs/audit/)
- [`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json`](./packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json)
- [`packages/agentpay-base/data/AUDITED_CONTRACTS.json`](./packages/agentpay-base/data/AUDITED_CONTRACTS.json)

before putting real value at risk.

---

## Packages

The canonical public API lives in the `@accord-protocol/*` packages. The older `ergo-agent-*` packages are maintained reference rail packages used by the Accord rail adapters and kept for downstream compatibility.

Until `v0.4.0` is tagged and published, treat npm/PyPI install commands as release targets and run workspace examples locally from this monorepo.

For install status, package role, rail scope, and mainnet posture, see the
[`package matrix`](./docs/PACKAGE_MATRIX.md).

### Accord Protocol packages

| Package | Purpose |
|---|---|
| [`@accord-protocol/core`](./packages/accord-core/) | Canonicalize, hash, validate Agreement / Verification Receipt / Settlement Receipt |
| [`@accord-protocol/mcp`](./packages/accord-mcp/) | Accord/MCP wrapper for paid, verifiable MCP tools |
| [`@accord-protocol/gateway`](./packages/accord-gateway/) | Accord/402 middleware for HTTP payment challenges and replay-protected verification |
| [`@accord-protocol/rails`](./packages/accord-rails/) | Shared rail adapter interface and mock rail |
| [`@accord-protocol/rails-ergo`](./packages/accord-rails-ergo/) | Ergo Note rail, testnet-first, audit-gated |
| [`@accord-protocol/rails-rosen`](./packages/accord-rails-rosen/) | Rosen-bridged assets on the Ergo rail, testnet-first |
| [`@accord-protocol/rails-base`](./packages/accord-rails-base/) | Base/EVM Note rail, testnet-first, audit-gated |
| [`@accord-protocol/rails-x402`](./packages/accord-rails-x402/) | x402-compatible rail adapter |
| [`@accord-protocol/conformance`](./packages/accord-conformance/) | Conformance CLI and test suite |
| [`@accord-protocol/buyer-policy`](./packages/accord-buyer-policy/) | Buyer-side policy engine for agentic wallets |

### Reference rail packages

| Package | Status | Purpose |
|---|---|---|
| [`ergo-agent-pay`](./packages/ergo-agent-pay/) | Maintained reference, testnet / not production-certified | Ergo Reserve / Note / Tracker SDK |
| [`ergo-agent-cli`](./packages/ergo-agent-cli/) | Maintained reference, testnet / not production-certified | CLI for Ergo Note lifecycle |
| [`ergo-agent-api`](./packages/ergo-agent-api/) | Legacy reference | Earlier 402 middleware shape; new code should prefer `@accord-protocol/gateway` |
| [`ergo-agent-mcp`](./packages/ergo-agent-mcp/) | Legacy reference | Earlier MCP server; new code should prefer `@accord-protocol/mcp` |
| [`ergo-agent-server`](./packages/ergo-agent-server/) | Maintained reference | Local HTTP bridge daemon |
| [`ergo-agent-scripts`](./packages/ergo-agent-scripts/) | Draft-pre-audit scripts | ErgoScript sources and audit manifests |
| [`ergo-agent-rosen`](./packages/ergo-agent-rosen/) | Maintained reference, testnet / not production-certified | Rosen bridge helper |
| [`agentpay-base`](./packages/agentpay-base/) | Maintained reference, testnet / not production-certified | Base/EVM reference SDK |
| [`ergo-agent-pay` Python](./packages/ergo-agent-py/) | Maintained reference | Python read-side SDK and bridge client |

---

## Quick start

The safest way to understand Accord is the mock-rail demo. It runs the full lifecycle without an Ergo node, x402 facilitator, Base RPC, or real funds.

```bash
git clone https://github.com/accord-protocol/accord-protocol
cd accord-protocol/examples/15-paid-mcp-repo-audit
npm install
npm run dev
```

You should see:

```text
Agreement -> mock payment -> MCP wrapper -> handler -> verifier -> Verification Receipt -> Settlement Receipt
```

### Ergo rail quickstart

For the Ergo rail, use testnet only:

```bash
cd accord-protocol/examples/01-basic-payment
npm install
# edit the example with your testnet address
node index.js
```

This produces unsigned transaction JSON. Sign with a testnet wallet or controlled test signer, then submit to the Ergo testnet API.

Do not use mainnet funds unless the relevant scripts are audited and the signed manifests mark them `mainnetAllowed: true`.

---

## Example modes

The short table below covers the canonical examples. The full 01-16 inventory
lives in [`docs/EXAMPLE_MODES.md`](./docs/EXAMPLE_MODES.md).

| Example | Mode | Uses real chain? | Uses real funds? | Mainnet certified? |
|---|---|---:|---:|---:|
| [`examples/15-paid-mcp-repo-audit`](./examples/15-paid-mcp-repo-audit/) | Mock rail | No | No | No |
| [`examples/01-basic-payment`](./examples/01-basic-payment/) | Ergo testnet | Yes | Testnet only | No |
| [`examples/02-note-payment`](./examples/02-note-payment/) | Ergo testnet / architecture | Yes | Testnet only | No |
| [`examples/03-acceptance-predicate`](./examples/03-acceptance-predicate/) | Ergo testnet / architecture | Yes | Testnet only | No |
| [`examples/05-api-payment-server`](./examples/05-api-payment-server/) | Ergo testnet / architecture | Yes | Testnet only | No |
| [`examples/11-cross-chain-rosen`](./examples/11-cross-chain-rosen/) | Rosen architecture / testnet-first | Partial | No | No |
| [`examples/12-paywalled-mcp`](./examples/12-paywalled-mcp/) | Legacy MCP / testnet-first | Optional | Testnet only | No |
| [`examples/13-paywalled-langchain`](./examples/13-paywalled-langchain/) | Legacy Ergo rail / testnet-first | Optional | Testnet only | No |
| [`examples/14-paywalled-crewai`](./examples/14-paywalled-crewai/) | Legacy Ergo rail / testnet-first | Optional | Testnet only | No |

---

## Security

Read [`SECURITY.md`](./SECURITY.md) before using Accord with real funds, customer workflows, or production agents.

Summary:

- Accord v0 is alpha / testnet-first.
- Mainnet writes are blocked by default.
- Audit manifests are draft-pre-audit.
- `mainnetAllowed: true` requires external audit evidence.
- Verifier, signer, bridge, wallet, tracker, oracle, and facilitator assumptions still matter.

Security-sensitive issues should not be reported through public issues. See [`SECURITY.md`](./SECURITY.md).

---

## Governance

Accord Protocol is currently v0 and maintainer-led with a public RFC process. See [`GOVERNANCE.md`](./GOVERNANCE.md) and [`MAINTAINERS.md`](./MAINTAINERS.md).

AgentAccord commercial services live outside this open-standard repository. Anyone can implement Accord, run the conformance suite, and build products without involving AgentAccord.

---

## Roadmap

Current priority order follows the phased roadmap:

1. Stabilize repository packaging, tests, release checks, and conformance packaging.
2. Prepare audit-ready manifests, threat model, and auditor handoff materials.
3. Harden Accord v0 schemas, conformance levels, registry rules, and buyer policy.
4. Improve quickstarts, examples, and contributor workflows for outside builders.
5. Run testnet pilots, then consider controlled mainnet only after signed audit manifests allow it.

See [`docs/PROFESSIONALIZATION_ROADMAP.md`](./docs/PROFESSIONALIZATION_ROADMAP.md).

---

## License

MIT. See [`LICENSE`](./LICENSE).
