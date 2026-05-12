# ACCORD-010 — Security and audit manifest

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`SECURITY.md`](../SECURITY.md), [`docs/audit/SIGNING_PLAYBOOK.md`](../docs/audit/SIGNING_PLAYBOOK.md), [`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json`](../packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json), [`packages/agentpay-base/data/AUDITED_CONTRACTS.json`](../packages/agentpay-base/data/AUDITED_CONTRACTS.json) |

## 1. Purpose

The Accord Protocol security model is built on two ideas:

1. **Production safety is enforced by the SDK, not by trust.** Any mainnet write goes through a two-gate guard. Skipping a gate requires an explicit, named, "I-know-what-I'm-doing" opt-in.
2. **What "audited" means is verifiable, not asserted.** The set of mainnet-allowed trees / contracts is a signed manifest. The signature comes from an external auditor. The SDK refuses to act on an unsigned manifest.

This spec describes the manifest shape, the signing workflow, and the SDK contract that consumes both.

## 2. The two-gate guard

Implemented in `assertProductionSafety()` in both [`ergo-agent-pay`](../packages/ergo-agent-pay/) and [`agentpay-base`](../packages/agentpay-base/). Conformance L3 ([ACCORD-009](./ACCORD-009-conformance.md)) probes both gates against both rails.

### 2.1 Gate 1 — Box-shape

| Network | `scriptErgoTree` (Ergo) / `contractAddress` (Base) | Override flag | Behaviour |
|---|---|---|---|
| `testnet` | any | any | always allowed |
| `mainnet` | set (non-empty) | any | passes Gate 1 |
| `mainnet` | missing / empty | `dangerouslyAllowInsecureMainnetP2PK: true` | passes Gate 1 (explicit opt-in) |
| `mainnet` | missing / empty | not set / `false` | **rejected** with `INSECURE_MAINNET_MODE` |

The legacy alias `allowInsecureDevMode: true` is still honoured for one minor-version cycle but deprecated.

### 2.2 Gate 2 — Audited identity

A non-empty `scriptErgoTree` / `contractAddress` only proves *some* on-chain artifact exists. Gate 2 closes the gap by requiring an `auditPolicy` callback that returns `{ ok: true }`.

The reference policy is `verifyAuditedErgoTree(...)` from [`ergo-agent-scripts`](../packages/ergo-agent-scripts/) (Ergo) and `verifyAuditedContract(...)` from [`agentpay-base`](../packages/agentpay-base/) (Base). Both check:

1. The supplied bytes hash to a manifest entry.
2. That entry has `mainnetAllowed: true`.
3. The manifest's `status` is `"auditor-signed"` (not `"draft-pre-audit"`).
4. The manifest's `auditor.signature` verifies against `auditor.publicKey` over the canonical bytes of the manifest with the signature stripped.

| Network | Verdict | Override flag | Behaviour |
|---|---|---|---|
| `testnet` | n/a | n/a | always allowed |
| `mainnet` | `{ ok: true }` | any | passes Gate 2 |
| `mainnet` | `{ ok: false }` or threw | any | **rejected** with `UNAUDITED_ERGOTREE` |
| `mainnet` | not configured | `dangerouslyAllowUnauditedErgoTree: true` | passes Gate 2 (strongly discouraged) |
| `mainnet` | not configured | not set / `false` | **rejected** with `UNAUDITED_ERGOTREE` |

Both gates fail-closed. Skipping either requires an explicit, loud opt-in flag.

## 3. The audit manifest

Two manifests, one per "settlement family":

| Manifest | Covers | Hash algorithm |
|---|---|---|
| [`AUDITED_ERGOTREES.json`](../packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json) | Ergo + Rosen rails (predicate trees) | `blake2b256(ergoTreeHex bytes)` |
| [`AUDITED_CONTRACTS.json`](../packages/agentpay-base/data/AUDITED_CONTRACTS.json) | Base / EVM rail (contract bytecode) | `keccak256(deployed bytecode)` |

The x402 rail does NOT have a manifest. Trust derives from the facilitator's signed payment proof.

### 3.1 Shape

```json
{
  "schema": "accord-protocol/audited-ergotrees/v1",
  "repo": "accord-protocol/accord-protocol",
  "manifest_created_at": "...",
  "status": "draft-pre-audit",
  "auditor": {
    "name": null,
    "publicKey": null,
    "report_url": null,
    "report_hash": null,
    "signed_at": null,
    "signature": null
  },
  "entries": [
    {
      "name": "credential_v0",
      "sourcePath": "...",
      "sourceHashBlake2b256": "<64 hex>",
      "postTemplateSourceHashBlake2b256": null,
      "ergoTreeHex": "...",
      "treeHashBlake2b256": "<64 hex>",
      "intendedSemantics": "...",
      "mainnetAllowed": false,
      "notes": "..."
    }
  ],
  "commit": "<git commit hash this manifest was generated at>"
}
```

### 3.2 Status values

- `"draft-pre-audit"` — initial state. No auditor signature. Every `mainnetAllowed` is `false`. The SDK refuses every mainnet write.
- `"auditor-signed"` — auditor signed the manifest. Some entries may be `mainnetAllowed: true`. The SDK only accepts those entries on mainnet.
- `"revoked"` — the previously-signed manifest has been revoked (e.g. a finding was discovered post-audit). Reverts to `draft-pre-audit` semantics until re-signed.

## 4. Signing flow

Full step-by-step in [`docs/audit/SIGNING_PLAYBOOK.md`](../docs/audit/SIGNING_PLAYBOOK.md). Summary:

1. **Auditor** runs `accord-conformance keygen` once. Stores private key in vault. Publishes public key.
2. **Maintainer** stages the manifest update on a branch — flips `mainnetAllowed: true` for the entries the auditor approved, fills the `auditor` block (name, publicKey, report_url, report_hash).
3. **Auditor** independently re-compiles the source, re-hashes the trees, confirms the manifest's hashes match what they reviewed.
4. **Auditor** signs: `accord-conformance sign --key 0x... --signer 'Acme Audits' AUDITED_ERGOTREES.json`. The output's `signature` block is copied into the manifest's `auditor.signature` + `auditor.signed_at`.
5. **Maintainer** verifies: `accord-conformance verify --expected-key 0x<pubkey> AUDITED_ERGOTREES.signed.json`. Aborts merge if it fails.
6. **SDK consumer** pins the auditor's public key in their `auditPolicy` and the SDK refuses to act on a manifest with a different public key.

The signing input is `BLAKE2b-256(canonical_json(manifest_without_signature))` — same algorithm used everywhere in this protocol (ACCORD-001 §5, ACCORD-002 §5).

## 5. Why this can't be the maintainer's signature

The maintainer wrote the source. If the maintainer's signature were sufficient to flip `mainnetAllowed: true`, the audit would be a no-op trust assertion. The two-gate guard exists specifically because **only an independent third party can produce the signature that allows mainnet writes**.

This is also why an AI assistant cannot legitimately produce this signature — the signature represents an audit conclusion that requires hands-on review of source, tooling, and manifest by a real, accountable party. The signing tool is the lever; pulling it is a deliberate human act backed by the audit work.

## 6. Threat model

This is the v0 threat model the SDK is designed to handle. Risks flagged as *out of scope* are real but not yet addressed.

### 6.1 In scope

| Threat | Mitigation |
|---|---|
| Off-chain hash silently disagreeing with on-chain `blake2b256` / `keccak256` | Single normative hash function per rail, golden vectors shared between SDKs |
| Dev-mode P2PK boxes broadcast on mainnet | `assertProductionSafety()` + `INSECURE_MAINNET_MODE` |
| Arbitrary unaudited tree on mainnet | `assertProductionSafety()` + `UNAUDITED_ERGOTREE` (audit gate) |
| Empty-string `scriptErgoTree` slipping through | Treated as missing; rejected on mainnet |
| Malformed task hash | `validateTaskHash` rejects non-64-hex strings |
| Task output too large for v0 single-byte length prefix | `encodeSigmaCollByte` enforces `taskOutput.length <= 255` |
| Cross-language SDK drift | Single shared `test-vectors/task-hash.json`, golden vectors loaded by both test suites |
| Replay / double-spend within one session | Per-Reserve Tracker, `replayStore` in `@accord-protocol/gateway` |
| Mempool front-running of `task_hash_v0` | Pinned `mainnetAllowed: false`. Production uses `credential_v0` (receiver-bound) |
| Raw lifecycle builders bypassing the audit gate | Renamed `dangerouslyBuild*Tx`. The high-level SDK class is the only path that always applies the audit gate |
| Schnorr `(a, z)` byte split malleability (Basis I-003) | Fiat-Shamir argument: `decodePoint` rejects malformed `aBytes`; `e = blake2b256(aBytes ‖ message ‖ pubkey)` commits to `aBytes`, so an attacker who picks `a` can't pick a matching `e` |

### 6.2 Out of scope (tracked, not yet mitigated)

- **Auditing of the on-chain ChainCash / Basis scripts.** Until those are audited and the manifest signed, mainnet use requires explicit `dangerously*` overrides plus manual review.
- **Tracker double-spend resistance under concurrent redemption.** v0 keeps the spent set as a flat list; v1 will move to a Merkle-root commitment.
- **Long task outputs.** v0 fits in single-byte length prefix; longer outputs need varint (v1).
- **Federated trackers and cross-chain liquidity.**
- **Privacy of counterparties and amounts.**
- **Wallet supply-chain attacks** on the agent's signer. The SDK accepts any function that satisfies `SignerFn`; protecting the signer (HSM, detached signing, approval gating) is the integrator's responsibility.
- **The MCP attack surface.** The MCP server inherits the trust boundary of the host process — anything that can reach it can call its tools. Use `policy` (budget caps, approval prompts) to bound damage.

## 7. Vulnerability disclosure

Email the maintainer directly. Don't open public issues for security-sensitive bugs. See [SECURITY.md](../SECURITY.md) §"Reporting a vulnerability".

## 8. Operational guidance

- Run on testnet until you have a signed manifest covering the trees / contracts you'll deploy.
- When you do go to mainnet, prefer hardware-signed flows; treat `dangerously*: true` as a smell.
- Fund a fresh address per agent so a compromise's blast radius is one Reserve.
- Configure `policy.maxSinglePayment`, `policy.maxSessionSpend`, `policy.requireApprovalAbove` even with small balances.
- Log every `unsignedTx` before signing.

## 9. Open questions (v1 candidates)

- **Multi-auditor signatures.** A manifest could carry several independent auditor signatures, requiring N-of-M to flip `mainnetAllowed: true`. Out of scope for v0.
- **Time-bounded signatures.** A signed manifest expires after N months; re-attestation required.
- **Compromise-recovery key rotation.** What happens if an auditor's signing key leaks. v0 says "issue a revocation"; v1 may add a more graceful key-rotation primitive.
