# Accord Protocol — positioning brief

> **Accord Protocol — the agreement protocol for autonomous agent work.**
> **AgentAccord — commercial infrastructure built on top of Accord Protocol.**

## What Accord is

An open protocol for **agreement, verification and settlement** between autonomous
agents that hire tools, APIs, humans and other agents. Accord defines:

- the **Agreement Object** — machine-readable terms of the engagement;
- the **Verification Receipt** — a verifier's signed verdict on the work;
- the **Settlement Receipt** — proof that the economic side closed out;
- transports (`Accord/402`, `Accord/MCP`) and rail adapters (Ergo, Rosen, Base,
  x402-compatible) that carry these objects across the wire.

## What Accord is NOT

- Not a payment processor — payment rails (USDC, ERG, rsUSDT, x402) move value;
  Accord records *why, when and whether* value should move.
- Not a replacement for MCP, A2A, x402 or AP2 — Accord layers on top.
- Not Ergo-only — Ergo is the first reference rail because of its predicate +
  Note primitives, but rails are pluggable.
- Not the AgentAccord product — AgentAccord is the company; Accord Protocol is
  the open standard. See [Brand boundary](#brand-boundary) below.

## How it relates to the surrounding stack

```text
MCP        → how agents call tools
A2A        → how agents talk to each other
x402 / AP2 → how a payment is authorized
Accord     → how the work agreement is formed, verified and settled
```

The one-liner that captures the differentiation:

```text
x402 verifies payment.
AP2 verifies authorization.
Accord verifies completion.
```

| Layer | Solves | Limit | What Accord adds |
|---|---|---|---|
| MCP | Tool connectivity | Doesn't model payment or completion | Paywalled tools + verification receipts |
| A2A | Agent-to-agent comms | Doesn't model settlement | Agreement object + signed receipts |
| x402 | Pay-per-request | Doesn't prove the work happened | Verifier + escrow + settlement receipt |
| AP2 | User authorization | Doesn't check work output | Completion verification |
| **Accord** | **Work agreement lifecycle** | Needs rails to settle | Rail adapters: Ergo, Rosen, Base, x402 |

## Why a separate protocol?

A naked payment answers exactly one question: *was money sent?* Agentic work
needs answers to:

- Who promised what?
- Who is the executor?
- What price, what deadline?
- What output is "correct"?
- Who verifies?
- What proof is required?
- When does payment unlock?
- What if the work fails?
- Can payment be on credit?
- Can settlement be batched?
- How does this affect reputation?

Accord captures this whole lifecycle:

```text
terms → lock/issue → execute → verify → settle → reputation
```

## Brand boundary

| | Accord Protocol | AgentAccord |
|---|---|---|
| What it is | Open standard | Company / commercial products |
| What it ships | Specs, schemas, SDKs, reference rails, contracts, conformance tests, audit manifests | Hosted gateway, marketplace, verifier routing, private registries, enterprise controls, dashboards |
| Where it lives | This repo + `accordprotocol.ai` | `agentaccord/*` repos + `agentaccord.com` |
| License | Permissive (MIT/Apache-2.0) on code; CC-BY/CC0 on specs/test vectors | Proprietary / source-available, depending on product |

The protocol is open. The operations are monetized.

## Anchor sentences

If anyone — investor, integrator, contributor — asks what we're building, the
answer is one of these:

- *Accord Protocol — the agreement protocol for autonomous agents.*
- *x402 verifies payment. Accord verifies completion.*
- *Accord turns paid API calls into enforceable agent agreements.*
- *Open standard, commercial infrastructure.*

## Where to read more

- [`specs/ACCORD-000-overview.md`](../specs/ACCORD-000-overview.md) — protocol overview RFC.
- [`docs/status.md`](./status.md) — current implementation + mainnet status.
- [`SPEC.md`](../SPEC.md) — Ergo-rail-specific protocol primitives (Reserve / Note / Tracker / Acceptance Predicate).
- [`SECURITY.md`](../SECURITY.md) — threat model, audit gates, mainnet safety story.
