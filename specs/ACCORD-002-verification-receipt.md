# ACCORD-002 — Verification Receipt

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-15 |
| Editors | bez111 |

## 1. Purpose

The **Verification Receipt** records a verifier's signed verdict on whether a
seller's work meets the Agreement's terms. It binds three things together:

```text
( agreement_hash , verifier_identity , verdict ) → signed receipt
```

A Settlement Receipt (ACCORD-003) MAY reference one or more Verification
Receipts. Whether settlement *requires* a positive Verification Receipt is
controlled by the Agreement's `verification.required` field (ACCORD-001 §3.6).

## 2. Schema

```json
{
  "type": "accord.verification_receipt.v0",
  "version": "v0",
  "receipt_id": "vr_01HX...",
  "agreement_id": "acc_01HX...",
  "agreement_hash": "blake2b256:0x...",
  "verifier": {
    "id": "verifier://security-v0",
    "wallet": "ergo:9XVerifier..."
  },
  "result": "accepted",
  "evidence": {
    "output_hash": "blake2b256:0x...",
    "output_ref": "ipfs://bafy...",
    "schema": "accord.audit_report.v0"
  },
  "checks": [
    { "name": "schema_valid",            "result": "pass" },
    { "name": "severity_present",        "result": "pass" },
    { "name": "file_references_present", "result": "pass" }
  ],
  "created_at": "2026-05-07T00:00:10Z",
  "signature": {
    "scheme": "ed25519",
    "public_key": "0x...",
    "signature": "0x..."
  }
}
```

## 3. Field reference

### Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | MUST equal `"accord.verification_receipt.v0"` |
| `version` | string | yes | MUST equal `"v0"` |
| `receipt_id` | string | yes | ULID-shaped (`vr_` + 26 base32 chars) |
| `agreement_id` | string | yes | The `agreement_id` of the parent Agreement |
| `agreement_hash` | string | yes | `accord_hash_v0` of the parent Agreement, hex-encoded with `blake2b256:0x` prefix |
| `verifier` | object | yes | see [§3.2](#32-verifier) |
| `result` | string | yes | One of `accepted`, `rejected`, `partial`, `disputed` (see [§4](#4-result-semantics)) |
| `evidence` | object | yes | see [§3.3](#33-evidence) |
| `checks` | array | no | Optional itemised check log (see [§3.4](#34-checks)) |
| `created_at` | string | yes | ISO-8601 UTC, second precision |
| `signature` | object | yes | see [§5](#5-signature) |

Unknown top-level extension fields are allowed when they are non-critical and
implementation-defined. A top-level field whose key starts with `accord_` MUST
be rejected. The `accord_` namespace is reserved for future protocol-defined
critical behavior that old implementations must not silently ignore.

### 3.2 verifier

```json
{
  "id": "verifier://security-v0",
  "wallet": "ergo:9XVerifier..."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | URI-shaped verifier identity (`verifier://`, `agent://`, `human://`) |
| `wallet` | string | no | Rail-prefixed address. If absent, the verifier is paid out-of-band. |

The verifier MUST be the entity named in the Agreement's `verification.verifier`
field. A receipt whose `verifier.id` does not match the Agreement is invalid.

### 3.3 evidence

```json
{
  "output_hash": "blake2b256:0x...",
  "output_ref": "ipfs://bafy...",
  "schema": "accord.audit_report.v0"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `output_hash` | string | yes | Hash of the seller's task output, prefixed with the algorithm name. Allowed prefixes: `blake2b256:0x...`, `keccak256:0x...`, `sha256:0x...`. The chosen algorithm SHOULD match the rail's native hash. |
| `output_ref` | string | no | URI to the actual output (IPFS, HTTPS, blob storage). Verifiers SHOULD include this for auditability. |
| `schema` | string | no | Schema name the output validates against. Mirrors `task.output_schema` from the Agreement. |

### 3.4 checks

Optional itemised log of the checks the verifier ran:

```json
[
  { "name": "schema_valid",     "result": "pass" },
  { "name": "test_suite_green", "result": "fail", "detail": "3 of 47 tests failed" }
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Snake-case identifier of the check |
| `result` | string | yes | `pass`, `fail`, `skip`, `inconclusive` |
| `detail` | string | no | Free-form human-readable note |

If the Agreement's `verification.evidence_required` is non-empty, every name
in that array MUST appear in `checks` with a non-`skip` result.

## 4. Result semantics

| `result` | Meaning | Effect on settlement |
|---|---|---|
| `accepted` | Verifier accepts work in full | Settlement is unblocked |
| `rejected` | Verifier rejects work | Settlement is blocked; refund flow per `settlement.refund_policy` |
| `partial` | Verifier accepts work with caveats | Settlement may proceed for a reduced amount; payment rail negotiates the split |
| `disputed` | Verifier defers to dispute resolution | Settlement is paused pending a Dispute Receipt |

A receipt MUST NOT have `result == "accepted"` if any required check failed.
A receipt with `result == "rejected"` MUST include at least one failed check
in the `checks` array (or a `detail` explaining the rejection).

## 5. Signature

The `signature` object proves the receipt was issued by the named verifier.

```json
{
  "scheme": "ed25519",
  "public_key": "0x...",
  "signature": "0x..."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `scheme` | string | yes | `ed25519`, `secp256k1`, `ergo-sigma` |
| `public_key` | string | yes | Hex-encoded public key with `0x` prefix |
| `signature` | string | yes | Hex-encoded signature with `0x` prefix |

The signature is computed over the **canonical JSON** of the receipt with the
`signature` field omitted, then BLAKE2b-256 hashed:

```text
signing_input = BLAKE2b-256(canonical_json_bytes_without_signature_field)
signature     = sign(verifier_private_key, signing_input)
```

Verifying:

1. Strip the `signature` field from the receipt.
2. Canonicalize the remainder per ACCORD-001 §4.
3. Compute BLAKE2b-256 of the canonical bytes.
4. Verify the signature against the verifier's public key over that hash.
5. Confirm the public key resolves to `verifier.id` via the registry (ACCORD-008).

## 6. Validation rules

A v0 implementation MUST reject a Verification Receipt that:

1. Fails schema validation.
2. References an `agreement_id` it cannot resolve, or whose `agreement_id`
   differs from the resolved parent Agreement when one is required by context.
3. Carries an `agreement_hash` that does not match the resolved Agreement's
   computed hash.
4. Has `result == "accepted"` while any element of `checks` has `result == "fail"`.
5. Names a `verifier.id` that does not match the parent Agreement's
   `verification.verifier`.
6. Has an invalid signature (cryptographic failure or key-to-identity mismatch).
7. Has a `created_at` outside a sensible window (e.g. before the Agreement's
   `created_at` or after the `payment.deadline` plus an implementation grace).
8. Has any element of the Agreement's `verification.evidence_required` array
   missing from `checks` or marked `skip`.
9. Carries a top-level extension field whose key starts with `accord_`.

A v0 implementation MAY warn (but MUST NOT reject) on:

- An unknown `signature.scheme` (verification fails, but the receipt is
  preserved as evidence).
- A `created_at` outside the Agreement's deadline by less than the grace
  window.

## 7. Hashing

```text
verification_receipt_hash = BLAKE2b-256(canonical_json_bytes)
```

The Settlement Receipt (ACCORD-003) references this hash to bind a settlement
to the verification that authorized it.

## 8. Test vectors

`test-vectors/verification-receipt/v0/`:

```text
accepted-minimal.json
accepted-with-checks.json
rejected-with-detail.json
partial-with-amount-split.json
disputed.json
invalid-accepted-with-failed-check.json     — must be rejected
invalid-verifier-mismatch.json              — must be rejected
invalid-signature.json                      — must be rejected
invalid-agreement-hash-algorithm.json       — must be rejected
invalid-reserved-accord-field.json          — must be rejected
```

Agreement-id and agreement-hash mismatch checks are context-dependent; the
reference validator and conformance suite exercise them against a resolved
parent Agreement.

## 9. Error codes

| Code | Meaning |
|---|---|
| `ACCORD_INVALID_SCHEMA` | Receipt fails schema validation. |
| `ACCORD_INVALID_SIGNATURE` | Signature does not verify against the named public key. |
| `ACCORD_AGREEMENT_MISMATCH` | `agreement_id` does not match the resolved Agreement. |
| `ACCORD_VERIFIER_MISMATCH` | `verifier.id` does not match the parent Agreement. |
| `ACCORD_HASH_MISMATCH` | `agreement_hash` does not match the resolved Agreement. |
| `ACCORD_RESULT_INCONSISTENT` | `result == "accepted"` while a required check failed. |
| `ACCORD_EVIDENCE_MISSING` | An `evidence_required` name is absent from `checks`. |

## 10. Open questions (v1 candidates)

- **Multi-verifier panels** — v0 supports a single verifier per receipt. A
  panel's verdict requires a wrapping object (`accord.panel_verification.v1`)
  that aggregates several individual receipts.
- **Threshold signatures** — for verifier-of-verifiers flows.
- **Evidence on-chain anchoring** — option to commit `evidence.output_hash` to
  a public blockchain timestamp.

---

See also: [ACCORD-001 Agreement Object](./ACCORD-001-agreement-object.md),
[ACCORD-003 Settlement Receipt](./ACCORD-003-settlement-receipt.md).
