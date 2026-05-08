# Accord Protocol Registry — preview

This folder is the **public, file-based** preview of `registry.accordprotocol.ai`. Anyone implementing Accord Protocol can submit a record here via PR; once merged, their record is part of the canonical registry.

It's structured as plain JSON files so it can be:

- consumed by the conformance suite (`@accord-protocol/conformance`),
- forked / mirrored without depending on a hosted service,
- fixed by PR rather than admin console.

When `accordprotocol.ai` ships, the hosted registry is built from this folder via CI.

## Layout

```text
registry/
├── README.md                    — this file
├── providers/                   — provider profiles (sellers, agents-as-services)
│   └── <provider-id>.json
├── verifiers/                   — verifier profiles (people / agents that sign verification receipts)
│   └── <verifier-id>.json
├── rails/                       — deployed rail adapters and their network info
│   └── <rail-name>.json
├── manifests/                   — pointers to audited tree / contract manifests
│   ├── ergo.json
│   └── base.json
└── revocations.json             — revoked records (kept for audit trail)
```

## Record types

### Provider profile (`providers/<id>.json`)

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
  }
}
```

### Verifier profile (`verifiers/<id>.json`)

```json
{
  "type": "accord.verifier_profile.v0",
  "version": "v0",
  "verifier_id": "verifier://example-security-v0",
  "display_name": "Example Security Verifier",
  "checks": ["schema", "github_pr", "test_suite", "static_analysis"],
  "fee": { "mode": "percentage", "value": "5" },
  "trust": {
    "completed_verifications": 0,
    "overturned": 0
  },
  "public_keys": [
    {
      "scheme": "ed25519",
      "public_key": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "rotated_at": null
    }
  ]
}
```

### Rail adapter (`rails/<rail>.json`)

Rail records are reference info — what payment_id format the rail uses, what currencies it accepts, link to the audited manifest. They're **descriptive**, not authoritative; the actual audit gate lives in the per-rail manifest (e.g. `AUDITED_ERGOTREES.json`).

```json
{
  "type": "accord.rail_adapter.v0",
  "version": "v0",
  "rail": "ergo",
  "package": "@accord-protocol/rails-ergo",
  "settlement_modes": ["note_redeemed", "reserve_refunded", "batch_settled"],
  "supported_currencies": ["ERG"],
  "payment_id_format": "Ergo Note box id (64 hex)",
  "manifest": "manifests/ergo.json"
}
```

### Manifest pointer (`manifests/<rail>.json`)

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

### Revocation entry (`revocations.json`)

```json
[
  {
    "revoked_id": "provider://example-repo-audit",
    "kind": "provider",
    "reason": "stale_conformance",
    "revoked_at": "2026-06-01T00:00:00Z",
    "details_url": "https://github.com/bez111/accord-protocol/issues/123"
  }
]
```

## Submitting a record

1. Run the [conformance suite](../packages/accord-conformance) against your endpoint to capture a result, then sign it. The full keygen / run / sign / verify flow is walked through in [`docs/conformance-signed-example.md`](../docs/conformance-signed-example.md), with a working signed artifact at [`docs/examples/conformance-result.signed.json`](../docs/examples/conformance-result.signed.json).
2. Open a PR adding a single JSON file under `providers/`, `verifiers/`, or `rails/`. Include your signed conformance result either in the PR description or as a sibling JSON file the maintainers can re-verify.
3. The PR description should include:
   - what your service does, in 1-2 sentences;
   - a link to your conformance result;
   - which Accord-compatibility level you claim (`L0`–`L4`).
4. Maintainers triage. Bar to merge: schema-valid + at least L0 conformance.

## What's in this preview

This commit ships the registry **directory layout + READMEs + format docs** with one **example** record per kind so submitters can copy-paste a starting point. There are no real provider listings yet — that's intentional. The first real listings will arrive alongside the one-command MCP demo (PR-020) and the conformance suite (PR-017+).

## Trademark

Listing in this registry does NOT grant the right to use the AgentAccord name, the conformance badges, or the *"Accord Protocol"* trademark beyond descriptive use. See [`TRADEMARK.md`](../TRADEMARK.md).
