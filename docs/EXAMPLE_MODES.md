# Example Modes

Last updated: 2026-05-15

This page classifies every example by execution mode, chain access, real-funds
risk, and mainnet certification status. It exists so examples can stay useful
without implying production readiness.

Rules of thumb:

- Mock and simulation examples do not touch a chain or real funds.
- Testnet examples may submit real testnet transactions and require testnet
  wallets or faucets.
- Legacy examples demonstrate older `ergo-agent-*` APIs; new Accord work should
  start with the canonical `@accord-protocol/*` packages where possible.
- No example in this repository is mainnet-certified.

| Example | Mode | Real chain access? | Real funds? | Mainnet certified? | Notes |
|---|---|---:|---:|---:|---|
| [`01-basic-payment`](../examples/01-basic-payment/) | Ergo testnet | Yes | Testnet only | No | Builds a basic unsigned/payment flow against testnet APIs. |
| [`02-note-payment`](../examples/02-note-payment/) | Ergo testnet / architecture | Yes | Testnet only | No | Issues a Note-style payment using testnet placeholders. |
| [`03-acceptance-predicate`](../examples/03-acceptance-predicate/) | Ergo testnet / architecture | Yes | Testnet only | No | Demonstrates task-output hash binding. |
| [`04-orchestrator-budget`](../examples/04-orchestrator-budget/) | Local simulation | No | No | No | Builds unsigned budget-delegation transactions from mock data. |
| [`05-api-payment-server`](../examples/05-api-payment-server/) | Ergo testnet server | Yes | Testnet only | No | Minimal paid API server; signer and replay storage are placeholders. |
| [`06-python-agent`](../examples/06-python-agent/) | Python testnet client | Depends on example 05 | Testnet only | No | Calls the legacy API server with Note headers. |
| [`07-end-to-end-agent-economy`](../examples/07-end-to-end-agent-economy/) | Legacy end-to-end testnet | Yes | Testnet only | No | Combines legacy SDK, API, server, scripts, and Python bridge. |
| [`07-streaming-pay`](../examples/07-streaming-pay/) | Local simulation | No | No | No | Simulates pay-per-token accounting. |
| [`08-treasury-multisig`](../examples/08-treasury-multisig/) | Local simulation | No | No | No | Demonstrates Sigma threshold policy with mock keys. |
| [`09-crewai-agents`](../examples/09-crewai-agents/) | Mock by default; optional legacy server | Optional | Testnet only if connected | No | CrewAI is optional; default path is local mock. |
| [`10-autogen-agent`](../examples/10-autogen-agent/) | Mock by default; optional legacy server | Optional | Testnet only if connected | No | AutoGen is optional; default path is local mock. |
| [`11-cross-chain-rosen`](../examples/11-cross-chain-rosen/) | Rosen architecture / testnet-first | Optional | No by default | No | Bridge assumptions are external; not a mainnet recipe. |
| [`12-paywalled-mcp`](../examples/12-paywalled-mcp/) | Legacy MCP / testnet-first | Optional | Testnet only | No | Prefer `@accord-protocol/mcp` for new work. |
| [`13-paywalled-langchain`](../examples/13-paywalled-langchain/) | Legacy LangChain / testnet-first | Optional | Testnet only | No | Demonstrates wire shape for paid LangChain tools. |
| [`14-paywalled-crewai`](../examples/14-paywalled-crewai/) | Legacy CrewAI / testnet-first | Optional | Testnet only | No | Demonstrates shared payment policy across a crew. |
| [`15-paid-mcp-repo-audit`](../examples/15-paid-mcp-repo-audit/) | Mock rail | No | No | No | Canonical one-command Accord lifecycle demo. |
| [`16-paid-mcp-ergo-testnet`](../examples/16-paid-mcp-ergo-testnet/) | Ergo testnet | Yes | Testnet only | No | Non-mock counterpart of example 15. |

Before turning any example into production infrastructure, check
[`docs/status.md`](./status.md), [`SECURITY.md`](../SECURITY.md), and the
relevant audit manifests. Mainnet use requires signed external audit evidence
for the exact scripts or contracts being used.

