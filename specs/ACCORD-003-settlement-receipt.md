# ACCORD-003 — Settlement Receipt

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-15 |
| Editors | bez111 |

## 1. Purpose

The **Settlement Receipt** is the rail-anchored proof that the economic side
of an Accord engagement has resolved — settled, refunded, partially settled,
or failed. It binds:

```text
( agreement_hash , rail , final_economic_state ) → rail-attested receipt
```

A Settlement Receipt is the closing record of the six-phase lifecycle
([ACCORD-000 §4](./ACCORD-000-overview.md#4-lifecycle)). For an engagement
whose Agreement set `verification.required: true`, the Settlement Receipt
SHOULD reference one or more Verification Receipts (ACCORD-002).

## 2. Schema

```json
{
  "type": "accord.settlement_receipt.v0",
  "version": "v0",
  "settlement_id": "sr_01HX...",
  "agreement_id": "acc_01HX...",
  "agreement_hash": "blake2b256:0x...",
  "verification_receipts": [
    "blake2b256:0x..."
  ],
  "rail": "ergo",
  "mode": "note_redeemed",
  "status": "settled",
  "amount": "25",
  "currency": "ERG",
  "decimals": 9,
  "tx": {
    "network": "testnet",
    "tx_id": "0x...",
    "box_id": "0x...",
    "block_height": 1234567,
    "confirmations": 12
  },
  "created_at": "2026-05-07T00:00:20Z"
}
```

## 3. Field reference

### Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | MUST equal `"accord.settlement_receipt.v0"` |
| `version` | string | yes | MUST equal `"v0"` |
| `settlement_id` | string | yes | ULID-shaped (`sr_` + 26 base32 chars) |
| `agreement_id` | string | yes | The `agreement_id` of the parent Agreement |
| `agreement_hash` | string | yes | `accord_hash_v0` of the parent Agreement, hex-encoded with `blake2b256:0x` prefix |
| `verification_receipts` | array | conditional | Required when the parent Agreement set `verification.required: true`. Array of `verification_receipt_hash` values. |
| `rail` | string | yes | One of `ergo`, `rosen`, `base`, `x402` |
| `mode` | string | yes | Rail-specific settlement mode (see [§3.2](#32-mode-by-rail)) |
| `status` | string | yes | One of `settled`, `refunded`, `partial`, `failed`, `pending` (see [§4](#4-status-semantics)) |
| `amount` | string | yes | Decimal string of the actual settled amount (may be less than the Agreement's `price.amount` for `partial`) |
| `currency` | string | yes | Mirrors the Agreement's `price.currency` |
| `decimals` | integer | yes | Mirrors the Agreement's `price.decimals` |
| `tx` | object | yes | see [§3.3](#33-tx) |
| `signature` | object | no | Optional issuer signature (see [§5](#5-optional-signature)) |
| `created_at` | string | yes | ISO-8601 UTC, second precision |

Unknown top-level extension fields are allowed when they are non-critical and
implementation-defined. A top-level field whose key starts with `accord_` MUST
be rejected. The `accord_` namespace is reserved for future protocol-defined
critical behavior that old implementations must not silently ignore.

### 3.2 mode by rail

| Rail | Allowed `mode` values | Meaning |
|---|---|---|
| `ergo` | `note_redeemed` | An Ergo Note backing the Agreement was redeemed. `tx.box_id` is the redeemed Note's box id. |
| `ergo` | `reserve_refunded` | The Note expired or was rejected; the Reserve absorbed the value back. |
| `ergo` | `batch_settled` | One of N Notes settled in a `dangerouslyBuildBatchSettleTx` call. `tx.tx_id` is the batch tx; `tx.box_id` is the redeemed Note. |
| `rosen` | `note_redeemed`, `reserve_refunded`, `batch_settled` | Same as `ergo` rail; the underlying token is rsUSDT/rsUSDC/rsBTC. |
| `base` | `redeemed`, `refund_expired` | Solidity `redeemNote` / `refundExpired` call. `tx.tx_id` is the EVM tx hash. |
| `x402` | `paid_before_response` | An x402 facilitator confirmed payment before the response was served. `tx.tx_id` is the facilitator-issued payment proof. |

### 3.3 tx

```json
{
  "network": "testnet",
  "tx_id": "0x...",
  "box_id": "0x...",
  "block_height": 1234567,
  "confirmations": 12
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `network` | string | yes | `mainnet`, `testnet`, `sepolia`, `base-sepolia` |
| `tx_id` | string | yes | Rail-specific tx id (Ergo BLAKE2b-256, EVM keccak256, x402 facilitator id) |
| `box_id` | string | conditional | Required for Ergo / Rosen rails; the box id of the Note or Reserve output |
| `block_height` | integer | no | Block / slot at which the tx was included |
| `confirmations` | integer | no | Number of confirmations at receipt-issue time |
| `proof` | string | no | Optional inclusion-proof URI for light-client verification |

## 4. Status semantics

| `status` | Meaning | When emitted |
|---|---|---|
| `settled` | Amount transferred to seller in full | After `mode: note_redeemed` / `redeemed` / `paid_before_response` confirms |
| `partial` | Amount transferred to seller is less than `price.amount` | After a Verification Receipt with `result: "partial"` resolves |
| `refunded` | Amount returned to buyer | After `mode: reserve_refunded` / `refund_expired` confirms |
| `failed` | Settlement attempted but did not resolve | Rail rejection or insufficient funds |
| `pending` | Settlement initiated, not yet confirmed | Tx submitted, awaiting `confirmations >= rail-min` |

A `pending` receipt is mutable — it MAY be replaced by a final-status receipt
with the same `settlement_id`. A `settled` / `refunded` / `partial` / `failed`
receipt is immutable.

## 5. Optional signature

A Settlement Receipt is rail-anchored — its truth comes from the on-chain tx,
not from a signature. v0 makes the receipt's `signature` optional. When
present, it serves as a "this receipt was assembled by entity X" attestation
useful for hosted gateways and registry submissions:

```json
{
  "scheme": "ed25519",
  "public_key": "0x...",
  "signature": "0x...",
  "signer_role": "gateway"
}
```

`signer_role` SHOULD be one of `gateway`, `provider`, `verifier`, `registry`.

The signature is computed identically to ACCORD-002 §5: canonicalize the
receipt with the `signature` field stripped, BLAKE2b-256 the canonical bytes,
sign that hash.

## 6. Hashing

```text
settlement_receipt_hash = BLAKE2b-256(canonical_json_bytes)
```

This hash is the unit a registry indexes; webhooks reference it; dashboards
display its hex prefix.

## 7. Validation rules

A v0 implementation MUST reject a Settlement Receipt that:

1. Fails schema validation.
2. Carries an `agreement_hash` that does not match the resolved Agreement's
   computed hash.
3. Has a `mode` that is not in the allow-list for its `rail`.
4. Has `status: "settled"` while the parent Agreement set
   `verification.required: true` and `verification_receipts` is empty.
5. Has `amount > price.amount` from the parent Agreement.
6. Has `status: "partial"` without a referenced Verification Receipt whose
   `result == "partial"`.
7. Has a `tx.tx_id` whose format does not match the rail (e.g. Ergo tx_id
   must be 64 hex chars; EVM tx_id must be 0x + 64 hex chars).
8. Has `created_at` before the parent Agreement's `created_at`.
9. Carries a top-level extension field whose key starts with `accord_`.

A v0 implementation SHOULD verify the rail-side claim (re-fetch the tx from
the rail and confirm `box_id` / `tx_id` exist with the claimed effect) before
trusting a Settlement Receipt for high-value flows. The conformance suite's
L2 tests assert this for the reference rail adapters.

## 8. Receipt chain

For a typical engagement:

```text
Agreement                    accord.agreement.v0
   │
   ├─→ Verification Receipt  accord.verification_receipt.v0  ⎯⎯⎯⎯⎯╮
   │      result: accepted                                          │
   │                                                                │
   └─→ Settlement Receipt    accord.settlement_receipt.v0  ◀────────╯
          status: settled
          verification_receipts: [verification_receipt_hash]
```

For a refund (verification rejected):

```text
Agreement
   │
   ├─→ Verification Receipt
   │      result: rejected
   │
   └─→ Settlement Receipt
          status: refunded
          verification_receipts: [verification_receipt_hash]
```

For a no-verification-required flow (e.g. simple paid API):

```text
Agreement                    verification.required: false
   │
   └─→ Settlement Receipt
          status: settled
          verification_receipts: []
```

## 9. Test vectors

`test-vectors/settlement-receipt/v0/`:

```text
ergo-note-redeemed.json
ergo-reserve-refunded.json
ergo-batch-settled.json
base-redeemed.json
base-refund-expired.json
rosen-rsusdt-redeemed.json
x402-paid-before-response.json
partial-with-verification.json
pending-then-settled.json                — pair: pending receipt + final
invalid-amount-exceeds-agreement.json    — must be rejected
invalid-agreement-hash-algorithm.json    — must be rejected
invalid-mode-for-rail.json               — must be rejected
invalid-reserved-accord-field.json       — must be rejected
invalid-no-verification-when-required.json — must be rejected
```

## 10. Error codes

| Code | Meaning |
|---|---|
| `ACCORD_INVALID_SCHEMA` | Receipt fails schema validation. |
| `ACCORD_HASH_MISMATCH` | `agreement_hash` does not match the resolved Agreement. |
| `ACCORD_MODE_INVALID_FOR_RAIL` | `mode` is not in the allow-list for `rail`. |
| `ACCORD_VERIFICATION_REQUIRED` | `status: settled` but no Verification Receipt was referenced when one was required. |
| `ACCORD_AMOUNT_EXCEEDS_AGREEMENT` | `amount > price.amount`. |
| `ACCORD_TX_FORMAT_INVALID` | `tx.tx_id` does not match the rail's tx-id format. |
| `ACCORD_UNKNOWN_CRITICAL_EXTENSION` | Top-level field uses the reserved `accord_` prefix. |
| `ACCORD_RAIL_NOT_CONFIRMED` | (When verifying against the rail) the named tx does not exist or did not have the claimed effect. |

## 11. Open questions (v1 candidates)

- **Streaming settlements** — pay-per-token APIs need a stream of micro-receipts.
  v0 emits one receipt per settlement; v1 may add `accord.settlement_stream.v1`.
- **Cross-rail atomic settlement** — when payment is locked on rail A but
  settled on rail B (HTLC-style). v0 keeps each receipt single-rail.
- **Receipt revocation** — what happens when a confirmed `settled` receipt's
  underlying tx is reorged out. v0 does not specify.

---

See also: [ACCORD-001 Agreement Object](./ACCORD-001-agreement-object.md),
[ACCORD-002 Verification Receipt](./ACCORD-002-verification-receipt.md).
