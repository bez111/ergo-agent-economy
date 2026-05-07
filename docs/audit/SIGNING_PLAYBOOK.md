# Audit signing playbook

How an external auditor signs an Accord Protocol audit manifest, and how the
SDK uses that signature to flip `mainnetAllowed` flags safely.

| Role | Who | What they do |
|---|---|---|
| **Auditor** | Independent firm or person who reviewed the source + compiled artifacts | Generates an ed25519 keypair, publishes the public key, signs the manifest |
| **Maintainer** | bez111 (this repo) | Stages a manifest update, sends it to the auditor, lands the signed manifest |
| **SDK consumer** | Anyone calling `ErgoAgentPay` / `BaseAgentPay` on mainnet | Configures `auditPolicy` to verify against the signed manifest |

Until an auditor signs, every entry in
`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json` and
`packages/agentpay-base/data/AUDITED_CONTRACTS.json` is `mainnetAllowed: false`,
and the SDK refuses every mainnet write. That's the correct security posture.

## What the auditor signs

The whole manifest object — minus its own `auditor.signature` field — is
canonicalized (deterministic JSON) and BLAKE2b-256-hashed. The auditor signs
that 32-byte digest.

The signing input matches the convention from ACCORD-002 §5: strip the
`signature` field, canonicalize, hash, sign. The same algorithm `accord-conformance sign` uses for any Accord JSON object.

## Step 1 — Auditor: generate keypair (one-time)

```bash
$ npx accord-conformance keygen

ed25519 keypair (KEEP THE PRIVATE KEY SECRET):

  private:  0x<64 hex>
  public:   0x<64 hex>

Use --key '0x...' to sign; share '0x...' so verifiers know it's you.
```

The auditor:
- stores the **private key** in a secure vault (HSM, encrypted storage, hardware token)
- publishes the **public key** alongside the audit report — SDK consumers pin against it
- the public key gets recorded in the manifest's `auditor.publicKey` field

## Step 2 — Maintainer: stage the update

The maintainer prepares the manifest update on a branch:

1. Flip `mainnetAllowed: true` for entries the auditor explicitly approved
2. Set `status: "auditor-signed"` (was `"draft-pre-audit"`)
3. Fill the `auditor` block:

```json
{
  "auditor": {
    "name": "Acme Audits Inc.",
    "publicKey": "0x<auditor public key, 64 hex>",
    "report_url": "https://acme-audits.example/reports/accord-protocol-2026-q3.pdf",
    "report_hash": "blake2b256:0x<64 hex>",
    "signed_at": null,
    "signature": null
  }
}
```

4. Commit on a `chore/audit-signing` branch but DO NOT push to main yet.

## Step 3 — Auditor: sign the manifest

The auditor receives `AUDITED_ERGOTREES.json` (or `AUDITED_CONTRACTS.json`)
with the staged updates. They:

1. **Independently** verify every entry — re-compile the source, re-hash the
   tree, confirm the manifest's claimed hashes match the bytes they reviewed.
2. Sign:

```bash
$ npx accord-conformance sign \
    --key 0x<their private key> \
    --signer 'Acme Audits Inc.' \
    --output AUDITED_ERGOTREES.signed.json \
    AUDITED_ERGOTREES.json
✓ signed → AUDITED_ERGOTREES.signed.json
```

3. The signed file's `signature` field is the auditor's signature over the
   canonical bytes. The maintainer copies that signature block into the
   manifest's `auditor.signature` + `auditor.signed_at`.

## Step 4 — Maintainer: verify the signature

Before merging, the maintainer locally verifies:

```bash
$ npx accord-conformance verify \
    --expected-key 0x<auditor public key from step 1> \
    AUDITED_ERGOTREES.signed.json
✓ valid ed25519 signature
  public_key: 0x...
  signer:     Acme Audits Inc.
```

If `verify` returns non-zero, the signature does not match the bytes — the
maintainer ABORTS the merge and re-coordinates with the auditor.

## Step 5 — SDK consumer: trust the signature

The SDK's audit gate (`assertProductionSafety` in both `ergo-agent-pay` and
`agentpay-base`) consults an `auditPolicy` callback. Production code wires
this callback to verify against the signed manifest:

```ts
import { verifyAuditedErgoTree } from "ergo-agent-scripts";
import { verifySignature } from "@accord-protocol/conformance";
import manifest from "ergo-agent-scripts/data/AUDITED_ERGOTREES.json";

const TRUSTED_AUDITOR_PUBKEY = "0x<pinned in your code>";

async function auditPolicy(tree: string, scriptName?: string) {
  // 1. The manifest's signature must verify against the trusted public key.
  const sig = verifySignature(manifest, TRUSTED_AUDITOR_PUBKEY);
  if (!sig.ok) return { ok: false, reason: `manifest signature: ${sig.code}` };

  // 2. The tree must match an entry that's mainnet-allowed.
  return verifyAuditedErgoTree(scriptName ?? "", tree, { requireMainnet: true });
}
```

Two-gate guard:
1. **Box-shape** (must have a script) — refuses plain P2PK on mainnet
2. **Audit-identity** (manifest must be auditor-signed AND tree must be in it
   AND `mainnetAllowed: true`)

Both gates fail-closed. Skipping either requires an explicit `dangerously*: true`
override in the SDK config.

## Step 6 — Revocation

If a previously-allowed entry develops an issue, the auditor signs a new
manifest with that entry flipped back to `mainnetAllowed: false`. The
maintainer publishes a patch release; SDK consumers pin a minimum version
that includes the revocation.

There's no on-chain revocation list — the manifest IS the source of truth, and
the manifest is versioned via the package.

## Why this can't be the maintainer's signature

The maintainer wrote the source. If the maintainer's signature were sufficient
to flip `mainnetAllowed: true`, the audit would be a no-op trust assertion. The
two-gate guard exists specifically because **only an independent third party
can produce the signature that lets mainnet writes happen**.

This is also why Claude / any AI assistant cannot legitimately produce this
signature — the signature represents an audit conclusion that requires
hands-on review of source, tooling, and manifest by a real, accountable
party. The signing tool is the lever; pulling the lever is a deliberate
human act backed by the audit work.

## Current status

- Manifests: both `draft-pre-audit`
- Auditor identity: not selected yet
- Public key pinned in SDK code: none
- `mainnetAllowed: true` entries: zero across both manifests

The signing infrastructure is ready. The audit work is the bottleneck.
