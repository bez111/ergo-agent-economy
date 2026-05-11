# Audit Manifest Format

Audit manifests bind source, compiled artifacts, hashes, audit status, and mainnet permissions.

## Required fields

A manifest entry should include:

```json
{
  "id": "credential_v0",
  "component": "ergo-note-credential-predicate",
  "version": "0.1.0",
  "artifactType": "ergoTree",
  "hashAlgorithm": "blake2b256",
  "artifactHash": "...",
  "sourcePath": "packages/ergo-agent-scripts/src/...",
  "compiledAtCommit": "...",
  "auditStatus": "draft-pre-audit",
  "mainnetAllowed": false,
  "auditor": null,
  "auditReport": null,
  "signedManifest": null,
  "knownRisks": [
    "Not externally audited",
    "Not certified for production mainnet use"
  ]
}
```

## Status values

| Value | Meaning |
|---|---|
| `draft-pre-audit` | Internal/reference artifact only |
| `audit-requested` | External review requested |
| `audit-in-progress` | External review underway |
| `audited-with-findings` | Audit complete, findings unresolved or partially resolved |
| `audited-mainnet-allowed` | Audit complete and manifest signed for mainnet use |
| `deprecated` | Do not use for new integrations |

## Mainnet rule

`mainnetAllowed` must be `false` unless the exact artifact is covered by a signed external audit manifest.
