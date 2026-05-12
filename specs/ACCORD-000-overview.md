# ACCORD-000 — Protocol Overview

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |

## 1. Purpose

Accord Protocol defines a small set of machine-readable objects, transports and
rail adapters that let autonomous software agents form, verify, and settle
**work agreements** with other agents, APIs, MCP tools, or humans.

A "work agreement" answers more than a payment can on its own:

```text
Was money sent?       — payment rails answer this.
Was the work done?    — Accord answers this.
Was it accepted?      — verifiers, anchored by Accord receipts.
Did settlement land?  — rails settle, Accord records the settlement receipt.
```

## 2. Scope

In scope for v0:

- The Agreement Object (`accord.agreement.v0`).
- The Verification Receipt (`accord.verification_receipt.v0`).
- The Settlement Receipt (`accord.settlement_receipt.v0`).
- Two transports: `Accord/402` (HTTP) and `Accord/MCP` (Model Context Protocol).
- Rail adapters: Ergo (Note / Reserve / Tracker / Acceptance Predicate), Rosen
  (rsUSDT / rsUSDC on Ergo), Base/EVM (USDC), x402-compatible (HTTP 402).
- Conformance levels L0–L4.
- Audit-manifest cross-checks.
- Reference open-source SDK (`@accord-protocol/core` + `accord-mcp` + `accord-gateway` + rail packages).

Out of scope for v0:

- Hosted commercial infrastructure (lives in AgentAccord, separate repos).
- Marketplace ranking or reputation algorithms beyond raw counts.
- DAO governance.
- Privacy-preserving agreements (homomorphic encryption, zk receipts).

## 3. Relationship to surrounding stacks

```text
MCP        — how agents call tools
A2A        — how agents talk to each other
x402 / AP2 — how a payment / authorization is verified
Accord     — how the work agreement is recorded, verified and settled
```

Accord does not replace any of these. It layers on top:

| Layer | Solves | Limit | Accord adds |
|---|---|---|---|
| MCP | Tool connectivity | No payment / completion model | Paywalled tools + verification |
| A2A | Agent comms | No settlement model | Agreement + receipts |
| x402 | Pay-per-request | No completion proof | Verifier + escrow + settlement |
| AP2 | User authorization | No work output check | Completion verification |
| Accord | Work agreement lifecycle | Needs rails | Rail adapters: Ergo, Rosen, Base, x402 |

The headline differentiator:

> **x402 verifies payment. AP2 verifies authorization. Accord verifies completion.**

## 4. Lifecycle

A v0 Accord engagement has six phases:

```text
1. terms     — buyer and seller agree, an Agreement Object is canonicalized + hashed
2. lock      — buyer locks/issues funds (Note, x402 payment, escrow tx) referencing the agreement
3. execute   — seller performs the work
4. verify    — verifier evaluates output against the agreement and signs a Verification Receipt
5. settle    — settlement is initiated on a rail, producing a Settlement Receipt
6. record    — receipts are stored and (optionally) submitted to a registry
```

Disputes interrupt this flow at the verify or settle phase and produce a
`Dispute Receipt` (defined in ACCORD-009).

## 5. Object hashes and signatures

- Canonical encoding: deterministic JSON (UTF-8, lex-sorted keys, no whitespace,
  no floating-point amounts) — defined in ACCORD-001 §3.
- Protocol object hash: `accord_hash_v0 = BLAKE2b-256(canonical_json_bytes)`.
- Rail-specific task hashes are NOT replaced — they remain rail-specific:
  - Ergo: BLAKE2b-256 of the task output bytes (R6 register).
  - Base/EVM: keccak256 of the task output bytes.
  - x402: facilitator-defined payment proof.
- Signatures use `ed25519`, `secp256k1`, or `ergo-sigma` Schnorr; the scheme
  is named in the receipt's `signature.scheme` field.

## 6. Versioning

- Each object's `type` and `version` fields carry the protocol version: e.g.
  `"type": "accord.agreement.v0", "version": "v0"`.
- v0 is **draft** until ACCORD-001..003 are stable. Breaking changes during the
  draft phase are allowed; after stabilization, breaking changes bump the
  major version (`accord.agreement.v1`).
- Implementations MUST reject objects whose `version` they do not understand
  unless an explicit `--accept-unknown` flag is set.

## 7. Conformance levels

```text
L0  Schema-compatible      — objects validate against the v0 JSON schemas.
L1  Transport-compatible   — Accord/402 or Accord/MCP roundtrip works end-to-end.
L2  Rail-compatible        — at least one rail adapter passes verifyPayment + settle tests.
L3  Security-compatible    — production-safety gates fire on mainnet writes.
L4  Registry-certified     — listed in the public Accord registry with passing conformance.
```

Conformance levels are validated by the `accord-conformance` test suite
(spec ACCORD-009).

## 8. Open-source vs commercial

**Open** — and lives in `accord-protocol/accord-protocol` (this repo) + `accordprotocol.ai`:

- Specs, schemas, test vectors, conformance suite.
- SDKs, gateway core, MCP wrapper, rail adapters.
- ErgoScript / Solidity contracts, audit manifests, manifest verifiers.
- Examples.

**Commercial** — lives in `agentaccord/*` and `agentaccord.com`:

- Hosted gateway, marketplace, verifier routing.
- Private registries, enterprise policies, audit log exports.
- Hosted tracker / credit operations.

The protocol is open. The operations are monetized.

## 9. Security posture

- All v0 audited tree / contract entries are `mainnetAllowed: false` until
  signed by an external auditor. See [`SECURITY.md`](../SECURITY.md).
- The reference SDK enforces a two-gate guard:
  1. **Box-shape gate** — refuse mainnet writes without a compiled script.
  2. **Audit-identity gate** — refuse trees not in the signed manifest.
- Implementations claiming Accord-conformance MUST honour these gates or
  document an explicit, opt-in override path.

## 10. Document tree

| RFC | Title | Status |
|---|---|---|
| ACCORD-000 | Protocol Overview | this doc |
| [ACCORD-001](./ACCORD-001-agreement-object.md) | Agreement Object | draft |
| [ACCORD-002](./ACCORD-002-verification-receipt.md) | Verification Receipt | draft |
| [ACCORD-003](./ACCORD-003-settlement-receipt.md) | Settlement Receipt | draft |
| [ACCORD-004](./ACCORD-004-accord-402.md) | Accord/402 Transport | draft |
| [ACCORD-005](./ACCORD-005-accord-mcp.md) | Accord/MCP Transport | draft |
| [ACCORD-006](./ACCORD-006-rails.md) | Rails | draft |
| [ACCORD-007](./ACCORD-007-notes-credit.md) | Notes & Credit | draft |
| [ACCORD-008](./ACCORD-008-registry.md) | Registry | draft |
| [ACCORD-009](./ACCORD-009-conformance.md) | Conformance | draft |
| [ACCORD-010](./ACCORD-010-security-audit.md) | Security & Audit | draft |

## 11. Anchors

If anyone asks what Accord is, the answer is one of these:

- *Accord Protocol — the agreement protocol for autonomous agents.*
- *x402 verifies payment. Accord verifies completion.*
- *Accord turns paid API calls into enforceable agent agreements.*
- *Open standard, commercial infrastructure.*
