# ACCORD-001 — Agreement Object

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-15 |
| Editors | bez111 |

## 1. Purpose

The **Agreement Object** is the machine-readable record of what was promised
between two parties: who, what, for how much, under which verification rules,
on which rail. It is the protocol's atomic unit — every Verification Receipt
(ACCORD-002) and Settlement Receipt (ACCORD-003) references one.

Producing an Agreement Object is the first step in the six-phase lifecycle
defined in [ACCORD-000 §4](./ACCORD-000-overview.md#4-lifecycle):

```text
1. terms     ← Agreement Object created and hashed here
2. lock
3. execute
4. verify
5. settle
6. record
```

## 2. Schema

```json
{
  "type": "accord.agreement.v0",
  "version": "v0",
  "agreement_id": "acc_01HX...",
  "created_at": "2026-05-07T00:00:00Z",
  "buyer": {
    "id": "agent://buyer-agent",
    "wallet": "ergo:9XBuyer..."
  },
  "seller": {
    "id": "provider://repo-audit-agent",
    "wallet": "ergo:9XSeller..."
  },
  "task": {
    "kind": "repo_audit",
    "input_ref": "github:https://github.com/org/repo",
    "description": "Audit repository for critical security issues.",
    "output_schema": "accord.audit_report.v0"
  },
  "price": {
    "amount": "25",
    "currency": "ERG",
    "decimals": 9
  },
  "payment": {
    "mode": "note",
    "rail": "ergo",
    "reserve_ref": "ergo:box:abc...",
    "deadline": "+480 blocks"
  },
  "verification": {
    "required": true,
    "method": "verifier_receipt",
    "verifier": "verifier://security-v0",
    "predicate": "credential_v0",
    "evidence_required": [
      "report_hash",
      "files_referenced",
      "severity_schema_valid"
    ]
  },
  "settlement": {
    "mode": "batchable",
    "refund_policy": "expiry",
    "dispute_policy": "verifier_panel"
  },
  "metadata": {
    "labels": ["security", "repo-audit"],
    "visibility": "public"
  }
}
```

## 3. Field reference

### Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | MUST equal `"accord.agreement.v0"` |
| `version` | string | yes | MUST equal `"v0"` |
| `agreement_id` | string | yes | ULID-shaped (`acc_` + 26 base32 chars) |
| `created_at` | string | yes | ISO-8601 UTC, second precision |
| `buyer` | object | yes | see [§3.2](#32-buyer--seller) |
| `seller` | object | yes | see [§3.2](#32-buyer--seller) |
| `task` | object | yes | see [§3.3](#33-task) |
| `price` | object | yes | see [§3.4](#34-price) |
| `payment` | object | yes | see [§3.5](#35-payment) |
| `verification` | object | yes | see [§3.6](#36-verification) |
| `settlement` | object | yes | see [§3.7](#37-settlement) |
| `metadata` | object | no | implementation-defined; non-critical |

### 3.2 buyer / seller

```json
{
  "id": "agent://buyer-agent",
  "wallet": "ergo:9XBuyer..."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | URI-shaped identity. Schemes: `agent://`, `provider://`, `verifier://`, `human://` |
| `wallet` | string | no | Rail-prefixed address: `ergo:`, `eth:`, `base:`, `rosen:` |

If `wallet` is omitted the rail's payment mode MUST supply the address out-of-band.

### 3.3 task

```json
{
  "kind": "repo_audit",
  "input_ref": "github:https://github.com/org/repo",
  "description": "Audit repository for critical security issues.",
  "output_schema": "accord.audit_report.v0"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | string | yes | Snake-case task kind. Registered kinds live in `schemas/task-kinds.json`. Unknown kinds MUST be allowed but flagged. |
| `input_ref` | string | yes | URI for task input. Schemes: `github:`, `https:`, `ipfs:`, `data:`, `inline:`. The seller MUST be able to fetch from this URI. |
| `description` | string | yes | Plain text, ≤ 1024 chars. For human-readable logs and verifier prompts. |
| `output_schema` | string | no | Schema name registered in `schemas/`. Defines the structural contract verification will check. |
| `output_hash` | string | no | If set, the seller's output bytes MUST hash to this value (rail-specific algorithm). Used for pre-committed task hashes. |

### 3.4 price

```json
{
  "amount": "25",
  "currency": "ERG",
  "decimals": 9
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | string | yes | **Decimal string**. Floats are forbidden — they break canonical encoding. Express integer multiples of `10^-decimals`. |
| `currency` | string | yes | `ERG`, `USDC`, `USDT`, `rsUSDT`, `rsUSDC`, `rsBTC` (extensible). |
| `decimals` | integer | yes | Smallest-unit divisor for `amount`. ERG=9, USDC=6, etc. |

### 3.5 payment

```json
{
  "mode": "note",
  "rail": "ergo",
  "reserve_ref": "ergo:box:abc...",
  "deadline": "+480 blocks"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `mode` | string | yes | `note` (Ergo Note), `escrow` (lock-and-release), `pay_before_response` (x402-style), `batchable` (settle later). |
| `rail` | string | yes | `ergo`, `rosen`, `base`, `x402`. Defined in ACCORD-006. |
| `reserve_ref` | string | conditional | Required when `mode == "note"`; URI of the buyer's Reserve box. |
| `deadline` | string | yes | Either `"+N blocks"` (rail-relative), `"+N seconds"`, or an absolute ISO-8601 UTC timestamp. |

### 3.6 verification

```json
{
  "required": true,
  "method": "verifier_receipt",
  "verifier": "verifier://security-v0",
  "predicate": "credential_v0",
  "evidence_required": ["report_hash", "files_referenced"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `required` | boolean | yes | If `false`, settlement may proceed without a Verification Receipt. |
| `method` | string | yes | `verifier_receipt` (signed off-chain), `onchain_predicate` (acceptance predicate enforces the rule), `none`. |
| `verifier` | string | conditional | Required when `method == "verifier_receipt"`. URI of the verifier identity. |
| `predicate` | string | conditional | Required when `method == "onchain_predicate"`. Names the rail-specific predicate (e.g. `credential_v0`, `task_hash_v0`). |
| `evidence_required` | string[] | no | Names of fields the Verification Receipt's `checks` array MUST include. |

### 3.7 settlement

```json
{
  "mode": "batchable",
  "refund_policy": "expiry",
  "dispute_policy": "verifier_panel"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `mode` | string | yes | `inline` (settle in same tx as work), `batchable` (settle later in a batch), `manual` (operator-triggered). |
| `refund_policy` | string | yes | `expiry` (refund on deadline), `manual`, `none`. |
| `dispute_policy` | string | yes | `verifier_panel`, `manual_review`, `none`. |

## 4. Canonical encoding

The Agreement Object's hash is computed over a canonical JSON serialization:

1. UTF-8 byte encoding.
2. Object keys sorted **lexicographically by codepoint**.
3. No insignificant whitespace, no trailing whitespace, no BOM.
4. Numbers: integers as decimal digits, no leading zeros, no exponents.
5. Money amounts MUST be JSON strings, never JSON numbers.
6. Arrays preserve insertion order.
7. Timestamps MUST be ISO-8601 UTC with `Z` suffix and second precision.
8. Unknown extension fields are allowed at the object level but MUST NOT be
   prefixed `accord_` (reserved namespace).

## 5. Hashing

```text
agreement_hash = BLAKE2b-256(canonical_json_bytes)
```

This is the **protocol object hash**, a.k.a. `accord_hash_v0`. It is what
Verification and Settlement Receipts reference in their `agreement_hash` field.

Rail-specific task hashes (Ergo R6, Base keccak256, x402 facilitator proof)
are NOT replaced by `accord_hash_v0`. The two coexist:

- `accord_hash_v0` commits to the Agreement Object.
- `task_hash` (rail-specific) commits to the expected work output.

## 6. Signature (optional)

If both parties sign the Agreement, the signatures live in a top-level
`signatures` array:

```json
{
  "signatures": [
    {
      "by": "agent://buyer-agent",
      "scheme": "ed25519",
      "public_key": "0x...",
      "signature": "0x..."
    }
  ]
}
```

Signing is optional in v0 — many flows derive trust from the on-chain Note
issuance instead of an explicit Agreement signature. Signatures, when present,
are computed over `agreement_hash`, not over the raw object.

## 7. Validation rules

A v0 implementation MUST reject an Agreement Object that:

1. Has `type != "accord.agreement.v0"` or `version != "v0"`.
2. Has any required field missing.
3. Uses a JSON number where a string is required (notably `price.amount`).
4. Has an unknown `payment.mode`, `payment.rail`, `verification.method`,
   `settlement.mode`, `settlement.refund_policy`, or `settlement.dispute_policy`
   without an `--accept-unknown` flag.
5. Has a `payment.deadline` that does not parse as one of the three accepted
   forms (`"+N blocks"`, `"+N seconds"`, ISO-8601).
6. Carries a top-level extension field whose key starts with `accord_`.

A v0 implementation MAY warn (but MUST NOT reject) on:

- Missing `metadata`.
- Unknown `task.kind`.
- Unknown extension fields outside the reserved namespace.

## 8. Test vectors

Canonical test vectors live in `test-vectors/agreement/v0/`:

```text
test-vectors/agreement/v0/
├── minimal.json                — required fields only
├── repo-audit.json             — example used in this RFC
├── x402-style.json             — payment.mode = pay_before_response
├── batchable.json              — settlement.mode = batchable
├── invalid-amount-as-number.json — must be rejected
├── invalid-deadline-trailing-junk.json — must be rejected
├── invalid-reserved-accord-field.json — must be rejected
└── invalid-unknown-mode.json     — must be rejected (without --accept-unknown)
```

Each fixture has:

- the raw JSON
- the canonical-JSON form (bytes)
- the `agreement_hash` (hex)

These are loaded by the conformance suite (ACCORD-009).

## 9. Error codes

| Code | Meaning |
|---|---|
| `ACCORD_INVALID_SCHEMA` | Object fails schema validation. |
| `ACCORD_INVALID_AMOUNT` | `price.amount` is a number, not a string, or has a non-decimal-digit form. |
| `ACCORD_INVALID_TIMESTAMP` | `created_at` is not ISO-8601 UTC with `Z` suffix. |
| `ACCORD_INVALID_DEADLINE` | `payment.deadline` doesn't parse. |
| `ACCORD_UNKNOWN_CRITICAL_EXTENSION` | Top-level field uses the reserved `accord_` prefix. |
| `ACCORD_HASH_MISMATCH` | Computed hash does not match the asserted `agreement_hash`. |

## 10. Open questions (v1 candidates)

- **Multi-party agreements** — three-or-more-party engagements (buyer + seller +
  oracle) are not modeled in v0. Likely v1: `parties: [...]` array.
- **Composable agreements** — agreements that depend on the settlement of
  other agreements. v0 keeps each Agreement standalone.
- **Privacy** — v0 leaks task descriptions on the wire. v1 may add
  `description_hash` for confidential commerce.

---

See also: [ACCORD-002 Verification Receipt](./ACCORD-002-verification-receipt.md),
[ACCORD-003 Settlement Receipt](./ACCORD-003-settlement-receipt.md).
