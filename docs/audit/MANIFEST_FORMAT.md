# Audit Manifest Format

Audit manifests bind source, compiled artifacts, hashes, audit status, and mainnet permissions. They are the only mechanism that can make a mainnet-sensitive artifact eligible for production use.

## ErgoTree Manifest

Path: `packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json`

Top-level fields:

```json
{
  "schema": "accord-protocol/audited-ergotrees/v1",
  "repo": "accord-protocol/accord-protocol",
  "commit": "<source commit reviewed>",
  "manifest_created_at": "<ISO-8601 UTC>",
  "status": "draft-pre-audit",
  "description": "...",
  "hash_algorithms": {
    "sourceHashBlake2b256": "...",
    "postTemplateSourceHashBlake2b256": "...",
    "treeHashBlake2b256": "..."
  },
  "compiler": {
    "primary": {
      "name": "...",
      "version": "...",
      "lockfileHash": null,
      "command": "..."
    },
    "secondary_semantic_check": {
      "name": null,
      "version": null,
      "command": null
    }
  },
  "entries": [],
  "auditor": {
    "name": null,
    "contact": null,
    "credentials": null,
    "signature": null,
    "signedPayloadHash": null
  }
}
```

Entry fields:

```json
{
  "name": "credential_v0",
  "sourcePath": "packages/ergo-agent-scripts/data/predicates.json:inline:credential_v0",
  "sourceHashBlake2b256": "<64 hex>",
  "postTemplateSourceHashBlake2b256": null,
  "ergoTreeHex": "<compiled ErgoTree hex>",
  "treeHashBlake2b256": "<64 hex>",
  "intendedSemantics": "...",
  "mainnetAllowed": false,
  "notes": "..."
}
```

Rules:

- `sourceHashBlake2b256` is BLAKE2b-256 of the exact source bytes.
- `postTemplateSourceHashBlake2b256` is BLAKE2b-256 after template substitution, or `null` when there are no template variables.
- `treeHashBlake2b256` is BLAKE2b-256 of the decoded `ergoTreeHex` bytes.
- `mainnetAllowed` must remain `false` until a signed external audit covers that exact tree hash.
- `task_hash_v0` must remain `mainnetAllowed: false` unless a future audit explicitly accepts the mempool front-running risk and maintainers update `docs/status.md`.

## Base/EVM Contract Manifest

Path: `packages/agentpay-base/data/AUDITED_CONTRACTS.json`

Top-level fields:

```json
{
  "schema": "accord-protocol/audited-contracts/v1",
  "repo": "accord-protocol/accord-protocol",
  "package": "agentpay-base",
  "manifest_created_at": "<ISO-8601 UTC>",
  "status": "draft-pre-audit",
  "description": "...",
  "hash_algorithm": "keccak256(runtime bytecode at the deployment address, fetched via eth_getCode)",
  "entries": []
}
```

Entry fields:

```json
{
  "name": "AgentPayReserveV0",
  "network": "base",
  "address": "0x...",
  "bytecodeHashKeccak256": "0x...",
  "sourcePath": "packages/agentpay-base/contracts/AgentPayReserveV0.sol",
  "notes": "...",
  "mainnetAllowed": false,
  "signedAt": null,
  "signature": null
}
```

Rules:

- `bytecodeHashKeccak256` must be computed from runtime bytecode fetched from the deployment address.
- A source hash alone is not sufficient for mainnet certification.
- Empty `entries` is valid pre-audit state and must fail closed.
- `mainnetAllowed` must remain `false` until a signed external audit covers the exact network, address, and runtime bytecode hash.

## Status Values

| Value | Meaning |
|---|---|
| `draft-pre-audit` | Internal/reference artifact only |
| `audit-requested` | External review requested |
| `audit-in-progress` | External review underway |
| `signed` | External auditor signed the manifest |
| `audited-with-findings` | Audit complete, findings unresolved or partially resolved |
| `deprecated` | Do not use for new integrations |

The SDKs currently require `status === "signed"` plus `mainnetAllowed: true` for production mainnet allow-listing.

## Mainnet Rule

`mainnetAllowed` must be `false` unless the exact artifact is covered by a signed external audit manifest. Passing tests, conformance, testnet demos, and maintainer signatures are not enough.
