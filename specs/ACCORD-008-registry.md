# ACCORD-008 — Registry

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`registry/`](../registry/) |

## 1. Purpose

The Accord Registry is the public directory of:

- **Providers** — entities offering paid services (paid MCP tools, paid APIs, agent services)
- **Verifiers** — entities producing Verification Receipts
- **Rails** — deployed rail adapters (descriptive entries; the source of truth for audit-identity is the per-rail manifest, not the registry)
- **Manifests** — pointers to audited tree / contract manifests
- **Revocations** — entries that have been revoked (audit trail)

At v0 the registry is a **folder of JSON files** ([`registry/`](../registry/)), not a hosted service. Anyone implementing Accord Protocol can submit a record via PR; once merged, their record is canonical.

When `registry.accordprotocol.ai` ships, the hosted registry will be **built from this folder** via CI. The JSON files here remain the source of truth.

## 2. Layout

```text
registry/
├── README.md                — record types, submission process, trademark
├── providers/<id>.json      — provider profiles
├── verifiers/<id>.json      — verifier profiles
├── rails/<rail>.json        — rail adapter records
├── manifests/<rail>.json    — pointers to audited tree/contract manifests
└── revocations.json         — revoked records (audit trail; kept forever)
```

## 3. Record types

### 3.1 Provider profile (`providers/<id>.json`)

```json
{
  "type": "accord.provider_profile.v0",
  "version": "v0",
  "provider_id": "provider://example-repo-audit",
  "display_name": "Example Repo Audit Agent",
  "capabilities": ["repo_audit", "code_review"],
  "accepted_transports": ["accord/mcp", "accord/402"],
  "accepted_rails": ["ergo", "rosen", "base", "x402"],
  "pricing": [
    { "kind": "repo_audit", "amount": "25", "currency": "ERG", "decimals": 9 }
  ],
  "verification": {
    "required": true,
    "supported_verifiers": ["verifier://example-security-v0"]
  },
  "endpoints": {
    "well_known": "https://provider.example/.well-known/accord",
    "agreement_template": "https://provider.example/.well-known/accord/agreement-template"
  },
  "conformance": {
    "level": "L1",
    "last_run_at": "2026-05-07T00:00:00Z",
    "result_uri": "https://provider.example/conformance/result.json"
  },
  "signature": { /* optional, see §5 */ }
}
```

### 3.2 Verifier profile (`verifiers/<id>.json`)

```json
{
  "type": "accord.verifier_profile.v0",
  "version": "v0",
  "verifier_id": "verifier://example-security-v0",
  "display_name": "Example Security Verifier",
  "checks": ["schema", "github_pr", "test_suite", "static_analysis"],
  "fee": { "mode": "percentage", "value": "5" },
  "trust": { "completed_verifications": 0, "overturned": 0 },
  "public_keys": [
    {
      "scheme": "ed25519",
      "public_key": "0x<64 hex>",
      "rotated_at": null
    }
  ]
}
```

### 3.3 Rail adapter record (`rails/<rail>.json`)

```json
{
  "type": "accord.rail_adapter.v0",
  "version": "v0",
  "rail": "ergo",
  "package": "@accord-protocol/rails-ergo",
  "settlement_modes": ["note_redeemed", "reserve_refunded", "batch_settled"],
  "supported_currencies": ["ERG"],
  "payment_id_format": "Ergo Note box id (64 hex)",
  "task_hash_algorithm": "blake2b256",
  "manifest": "manifests/ergo.json"
}
```

This is **descriptive**. The audit gate doesn't trust this entry — it trusts the manifest the entry points at.

### 3.4 Manifest pointer (`manifests/<rail>.json`)

```json
{
  "type": "accord.audited_manifest_ref.v0",
  "version": "v0",
  "rail": "ergo",
  "manifest_path": "packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json",
  "status": "draft-pre-audit",
  "auditor_signature": null
}
```

### 3.5 Revocation entry (`revocations.json`)

```json
[
  {
    "revoked_id": "provider://example",
    "kind": "provider",
    "reason": "stale_conformance",
    "revoked_at": "2026-06-01T00:00:00Z",
    "details_url": "https://github.com/accord-protocol/accord-protocol/issues/123"
  }
]
```

Entries are append-only. A revoked-then-restored provider gets a new revocation entry **and** a fresh provider record under a new id.

## 4. Validation rules

L4 conformance ([ACCORD-009](./ACCORD-009-conformance.md)) static-validates the registry:

- Each record's `type` literal matches its directory (`accord.provider_profile.v0`, etc.)
- Each record's `version` is `"v0"`
- `revocations.json` is an array (possibly empty)
- Rail records' `manifest_path` resolves to a file that exists from the repo root
- Provider records' `accepted_rails ⊆ registered rails`
- Provider records' `conformance.level` (when present) is one of L0–L4

## 5. Optional: signed records

A registry record MAY carry an ed25519 signature in the same shape as Verification Receipts (ACCORD-002 §5). When the record is signed, downstream consumers can verify via `accord-conformance verify --expected-key 0x...`.

For provider records, the signing key is typically the provider's identity key (the same one they use to sign Verification Receipts they emit). For verifier records, the signing key is the verifier's pinned public key.

Records do not strictly need a signature — submission via PR-merge is the v0 trust model. Signed records are useful when records are mirrored outside this repo.

## 6. Submission process

1. Run the conformance suite against your endpoint.
2. Capture the JSON result (`accord-conformance run --json > result.json`).
3. (Optional) Sign it: `accord-conformance sign --key 0x... --signer 'provider://your-id' result.json -o signed.json`.
4. Open a PR adding a single JSON file under `providers/`, `verifiers/`, or `rails/` with a link to the conformance result.
5. Maintainers triage. Bar to merge: schema-valid + at least L0 conformance.

## 7. Trademark interaction

Listing in this registry does NOT grant the right to use the AgentAccord brand or the conformance badges beyond what your conformance-run result substantiates. See [TRADEMARK.md](../TRADEMARK.md) §3.

## 8. Open questions (v1 candidates)

- **Hosted index.** When `registry.accordprotocol.ai` ships, the static folder gets a CI-built JSON-API mirror.
- **Reputation aggregation.** A signed-conformance-result history lets the registry compute "% L2-passing in the last 30 days" without a centralised judge.
- **Discovery API.** "Find me providers offering `repo_audit` accepting `ergo` rail under 0.05 ERG."
