# Security Policy

## Status summary

Accord Protocol is alpha / testnet-first software.

- **Mainnet status:** `NOT CERTIFIED FOR MAINNET`.
- **Mainnet writes:** blocked by default until signed audit manifests mark relevant scripts/contracts `mainnetAllowed: true`.
- **Recommended usage:** local demos, mock rail, conformance tests, testnet experiments.
- **Do not use unaudited Accord, ChainCash/Basis, Note, Reserve, Tracker, or Acceptance Predicate scripts with real funds.**

See [`docs/status.md`](docs/status.md) for the single source of truth.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive bugs.

Preferred reporting channels:

1. Use GitHub private vulnerability reporting / Security Advisory flow if enabled for this repository.
2. Email: `security@agentaccord.com` once configured.
3. If neither channel is available, contact the current maintainer listed in [`MAINTAINERS.md`](MAINTAINERS.md) and request a private reporting channel.

Include:

- affected component (`@accord-protocol/core`, `gateway`, `mcp`, `rails-ergo`, `ergo-agent-pay`, `ergo-agent-scripts`, `agentpay-base`, spec text, etc.);
- a description of the vulnerability;
- minimal reproduction steps or proof of concept;
- expected impact;
- whether you want credit.

We aim to acknowledge security reports within seven days. Public disclosure should happen only after a fix, mitigation, or coordinated advisory plan is ready.

## Audit and mainnet gate

Two rail-specific manifest families gate mainnet writes:

| Rail | Manifest | Current status |
|---|---|---|
| Ergo Note / Rosen-on-Ergo | [`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json`](packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json) | Draft-pre-audit; entries should remain `mainnetAllowed: false` until signed external audit |
| Base / EVM Note | [`packages/agentpay-base/data/AUDITED_CONTRACTS.json`](packages/agentpay-base/data/AUDITED_CONTRACTS.json) | Draft-pre-audit; no production-certified entries |

The x402 rail does not carry an on-chain script manifest. Its trust depends on the facilitator payment proof, integration policy, replay protection, and settlement assumptions.

## Production-safety gates

The high-level SDK path should enforce two categories of protection:

1. **Shape gate** — reject unsafe plain mainnet boxes/contracts unless an explicit dangerous override is supplied.
2. **Audit identity gate** — reject trees/contracts whose hash is not listed in a signed manifest with `mainnetAllowed: true`.

Dangerous overrides are for research and local testing, not production deployment.

## Threat model — v0

### In scope

| Threat | Mitigation |
|---|---|
| Hash mismatch between off-chain code and on-chain script | Use normative chain-native hashing and shared test vectors |
| Plain P2PK / insecure mainnet box shape | Production-safety gate and dangerous override naming |
| Unaudited ergoTree or EVM bytecode | Audit manifest gate |
| Malformed task hash | Strict task-hash validation |
| Replay or duplicate spend inside one session | Policy engine and Tracker-style accounting where applicable |
| `task_hash_v0` mempool front-running | Keep such scripts `mainnetAllowed: false`; prefer receiver-bound credential-style predicates for mainnet candidates |
| SDK drift across TS / Python / MCP examples | Shared test vectors and conformance tests |
| Raw lifecycle builders bypassing guardrails | Document raw builders as dangerous; high-level SDK must remain guarded |
| MCP host attack surface | Treat MCP host as part of the trust boundary; apply spending policy and approval thresholds |

### Out of scope / not yet solved

- External audit of ChainCash/Basis on-chain scripts.
- Formal proof of Tracker concurrency and double-spend resistance under all race conditions.
- Privacy of counterparties and amounts.
- Wallet supply-chain attacks.
- Bridge/facilitator failure or censorship.
- Verifier collusion or incorrect work evaluation.
- Production-grade agent identity and reputation.

## Operational guidance

- Use testnet until relevant manifests are externally audited.
- Use fresh low-balance addresses for test agents.
- Prefer hardware or detached signing for any serious flow.
- Configure policy caps: max single payment, session spend, daily spend, recipient allowlists, rail allowlists, and approval thresholds.
- Log every unsigned transaction before signing.
- Treat all bridge, oracle, verifier, and facilitator integrations as separate trust boundaries.

## Known limitations

- The high-level SDK path is intended to enforce production-safety gates. Raw builders are advanced primitives and may require manual guardrails.
- The Python SDK may delegate signing to external tooling; guardrails must be applied wherever signing occurs.
- MCP tools expose a broad lifecycle surface; anything that can call the MCP server may attempt actions bounded only by policy.
- Passing conformance does not mean a component is audited or production-certified.
