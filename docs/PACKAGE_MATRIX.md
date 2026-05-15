# Package Matrix

Last updated: 2026-05-15

This matrix is the package-level companion to [`docs/status.md`](./status.md).
It states what each package is for, how it should be installed during the
`v0.4.1` release-candidate phase, and whether it can be used with mainnet
funds.

Until `v0.4.1` is tagged and published, npm and PyPI package names are release
targets. For local development, use the workspace from a clean checkout:

```bash
npm install
npm run build
npm test
```

Mainnet status is intentionally conservative. Passing tests or conformance does
not certify mainnet use. Mainnet writes remain blocked until signed external
audit manifests explicitly set the relevant artifact to `mainnetAllowed: true`.

## Canonical Accord Packages

| Package | Version | Install status | Role | Rail / funds scope | Mainnet status |
|---|---:|---|---|---|---|
| [`@accord-protocol/core`](../packages/accord-core/) | `0.4.1` | npm target after release; workspace now | Canonical JSON, hashes, schema-aware semantic validation | Rail-agnostic; no funds | Not a custody path |
| [`@accord-protocol/mcp`](../packages/accord-mcp/) | `0.4.1` | npm target after release; workspace now | Accord/MCP wrapper for paid tools | Depends on configured rail | Not certified for mainnet |
| [`@accord-protocol/gateway`](../packages/accord-gateway/) | `0.4.1` | npm target after release; workspace now | Accord/402 HTTP middleware and replay store hooks | Depends on configured rail | Not certified for mainnet |
| [`@accord-protocol/rails`](../packages/accord-rails/) | `0.4.1` | npm target after release; workspace now | Shared `AccordRailAdapter` interface and mock rail | Mock / interface only | No real-funds path by itself |
| [`@accord-protocol/rails-ergo`](../packages/accord-rails-ergo/) | `0.4.1` | npm target after release; workspace now | Ergo Note rail adapter | Ergo testnet first | Mainnet blocked by `AUDITED_ERGOTREES.json` |
| [`@accord-protocol/rails-rosen`](../packages/accord-rails-rosen/) | `0.4.1` | npm target after release; workspace now | Rosen-wrapped token rail on Ergo Notes | Testnet / architecture first | Inherits Ergo audit gate and bridge assumptions |
| [`@accord-protocol/rails-base`](../packages/accord-rails-base/) | `0.4.1` | npm target after release; workspace now | Base/EVM Note rail adapter | Base Sepolia first | Mainnet blocked by `AUDITED_CONTRACTS.json` |
| [`@accord-protocol/rails-x402`](../packages/accord-rails-x402/) | `0.4.1` | npm target after release; workspace now | x402-compatible facilitator adapter | Integration / facilitator-dependent | No standalone mainnet certification |
| [`@accord-protocol/conformance`](../packages/accord-conformance/) | `0.4.1` | npm target after release; workspace now | L0-L4 conformance suite and CLI | Test harness; no funds | Conformance is not an audit certificate |
| [`@accord-protocol/buyer-policy`](../packages/accord-buyer-policy/) | `0.4.1` | npm target after release; workspace now | Buyer-side signer policy and budget gate | Local signer policy; no rail custody | Not a mainnet audit certification layer |

## Reference And Legacy Packages

These packages are kept for compatibility and as reference implementations. New
Accord integrations should prefer the `@accord-protocol/*` packages above when
there is an equivalent.

| Package | Version | Install status | Role | Recommended usage | Mainnet status |
|---|---:|---|---|---|---|
| [`ergo-agent-pay`](../packages/ergo-agent-pay/) | `0.3.1` | npm target / legacy line | Ergo Reserve, Note, Tracker SDK | Testnet and reference integrations | Not certified for mainnet |
| [`ergo-agent-cli`](../packages/ergo-agent-cli/) | `0.3.1` | npm target / legacy line | CLI for Ergo Note lifecycle | Testnet workflows | Not certified for mainnet |
| [`ergo-agent-api`](../packages/ergo-agent-api/) | `0.3.1` | npm target / legacy line | Earlier Express paywall middleware | Legacy reference only | Not certified for mainnet |
| [`ergo-agent-mcp`](../packages/ergo-agent-mcp/) | `0.3.1` | npm target / legacy line | Earlier MCP paywall server | Legacy reference only | Not certified for mainnet |
| [`ergo-agent-server`](../packages/ergo-agent-server/) | `0.3.1` | npm target / legacy line | Local HTTP bridge daemon | Local/testnet bridge | Not certified for mainnet |
| [`ergo-agent-scripts`](../packages/ergo-agent-scripts/) | `0.3.1` | npm target / legacy line | ErgoScript sources and audit manifest loader | Audit inputs and reference trees | Draft-pre-audit only |
| [`ergo-agent-rosen`](../packages/ergo-agent-rosen/) | `0.3.1` | npm target / legacy line | Rosen helper utilities | Reference bridge tooling | Inherits Ergo/Rosen risks |
| [`agentpay-base`](../packages/agentpay-base/) | `0.3.1` | npm target / legacy line | Base/EVM Reserve and Note SDK | Base Sepolia / reference flows | Not certified for mainnet |
| [`ergo-agent-pay` Python](../packages/ergo-agent-py/) | `0.3.1` | PyPI target after release; workspace now | Python read-side SDK and bridge client | Read-side/testnet tooling | Not certified for mainnet |

## Release And Audit Gates

Before publishing or tagging a release, run:

```bash
npm run build
npm test
npm run typecheck
npm run release:check
npm run audit:check
npm run site:check
```

For mainnet-sensitive packages, also confirm:

- [`SECURITY.md`](../SECURITY.md) still states the correct risk posture.
- [`docs/status.md`](./status.md) still marks uncertified rails as testnet only.
- Audit manifests remain `draft-pre-audit` unless an external auditor has signed
  the exact artifact hash being enabled.
- No example requires disabling the default mainnet safety gates.

