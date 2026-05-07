# ACCORD-006 — Rails

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`@accord-protocol/rails`](../packages/accord-rails/), [`@accord-protocol/rails-{ergo,rosen,base,x402}`](../packages/) |

## 1. Purpose

Accord Protocol does not assume a single settlement chain. Rails are the pluggable layer that maps an Accord engagement to a payment system. Every Accord/MCP wrapper and Accord/402 gateway delegates to a rail adapter for two operations:

- `verifyPayment` — confirm the buyer's payment proof is valid for this Agreement
- `settle` — close out the economic side, return a Settlement Receipt

A third operation, `refund`, is rail-optional and only meaningful for rails that have an explicit refund flow (Base/EVM `refundExpired`). Rails that self-refund through an on-chain predicate (Ergo Notes) omit it.

## 2. The `AccordRailAdapter` interface

```ts
interface AccordRailAdapter {
  rail: string;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  settle?(input: SettleInput): Promise<AccordSettlementReceipt>;
  refund?(input: RefundInput): Promise<AccordSettlementReceipt>;
}

interface VerifyPaymentInput {
  agreement: AccordAgreement;
  payment: AccordPaymentProof;   // opaque to the wrapper; rail-specific
  buyerHint?: string;
}

type VerifyPaymentResult =
  | { ok: true; rail: string; payment_id: string; details?: Record<string, unknown> }
  | { ok: false; rail: string; code: string; message: string };
```

A rail adapter is a **pure object**, not a stateful service. The wrapping layer (gateway / MCP) supplies replay storage, agreement resolution, and receipt persistence. The rail's only job is to talk to its underlying payment system.

The full interface lives in [`@accord-protocol/rails`](../packages/accord-rails/).

## 3. `payment_id`

Every successful `verifyPayment` returns a `payment_id`: a non-empty string, stable for the same payment, suitable for the wrapper's replay-protection store. The shape varies per rail:

| Rail | `payment_id` |
|---|---|
| `ergo` | Ergo Note `boxId` (64 hex) |
| `rosen` | Ergo Note `boxId` (the wrapped token rides an Ergo Note) |
| `base` | EVM tx hash that locked the Note (preferred) or the deterministic `noteId` |
| `x402` | Facilitator-issued payment-proof id (typically the EVM tx hash) |

The wrapping layer SHOULD reject the second use of the same `payment_id` within a TTL window (default 24h in the reference implementation).

## 4. Per-rail allow-list

Per [ACCORD-003](./ACCORD-003-settlement-receipt.md), each rail has a fixed set of allowed `Settlement Receipt.mode` values. The reference implementation enforces this in `validateSettlementReceipt` and exposes it as the constant `RAIL_MODE_ALLOWLIST` from `@accord-protocol/core`:

| Rail | Allowed modes |
|---|---|
| `ergo` | `note_redeemed`, `reserve_refunded`, `batch_settled` |
| `rosen` | `note_redeemed`, `reserve_refunded`, `batch_settled` |
| `base` | `redeemed`, `refund_expired` |
| `x402` | `paid_before_response` |

## 5. Task-hash algorithm per rail

The Accord protocol object hash is **always** `accord_hash_v0 = BLAKE2b-256(canonical_json)`. This is rail-agnostic (see ACCORD-001 §5).

The **rail-specific task hash** stored in a Note's R6 / contract `taskHash` field uses the rail's native primitive:

| Rail | Task-hash algorithm |
|---|---|
| `ergo` | `blake2b256(taskOutput)` (matches ErgoScript's `blake2b256` builtin) |
| `rosen` | `blake2b256(taskOutput)` (same — rides Ergo) |
| `base` | `keccak256(taskOutput)` (matches Solidity's keccak256) |
| `x402` | facilitator-defined; the rail adapter doesn't compute one |

These coexist with `accord_hash_v0` — they don't replace it.

## 6. Reference rail adapters

Four reference rails ship in this repo. Each has its own README with the full payment-proof shape and rejection-code table.

### 6.1 `@accord-protocol/rails-ergo`

Maps Accord engagements to the Ergo Note primitive. The buyer attaches:

```json
{
  "note_box_id": "<64 hex>",
  "task_output": "<bytes the buyer pre-committed to>",
  "receiver_address": "<optional override>"
}
```

`verifyPayment` checks: shape → fetch via `ErgoNoteOps.checkNote` → not expired → reserve binding → R6 task-hash match → currency=ERG → value ≥ required nanoERG. `settle` calls `redeemNote(...)`.

### 6.2 `@accord-protocol/rails-rosen`

Same on-chain primitive as `rails-ergo`, but the value lives in the box's `tokens[]` array (rsUSDT / rsUSDC / rsBTC). The adapter takes a caller-supplied `RosenTokenRegistry` mapping currency names to token-ids and decimals, and looks up the carried token amount.

### 6.3 `@accord-protocol/rails-base`

Maps to the Base/EVM Note primitive (`AgentPayReserveV0` Solidity contract). `verifyPayment` reads the on-chain Note via `BaseNoteOps.checkNote` (a viem-compatible client), checks `keccak256(task_output) === note.taskHash`, checks not-redeemed and not-expired. `settle` calls the contract's `redeemNote(noteId, taskOutput)`. `refund` calls `refundExpired(noteId)`.

### 6.4 `@accord-protocol/rails-x402`

Wraps any [x402 facilitator](https://github.com/coinbase/x402) (Coinbase, self-hosted, custom) into the Accord rail interface. The buyer's payment proof is whatever the facilitator's `payment_requirements` indicates (typically an EIP-3009 signed authorization for USDC on Base, base64-encoded). The adapter doesn't decode it — it forwards to the facilitator's `verify` endpoint and uses the response.

## 7. Building a third-party rail

A new rail is conformant when it:

1. Implements `AccordRailAdapter` — `rail` field + `verifyPayment` (settle / refund optional)
2. Returns a stable `payment_id` from successful `verifyPayment`
3. Emits Settlement Receipts whose `mode` is in `RAIL_MODE_ALLOWLIST[receipt.rail]`
4. Returns receipts that pass `validateSettlementReceipt` from `@accord-protocol/core`
5. Rejects garbage payments structurally (not via thrown exceptions for typed rejections)

The conformance suite (L2) takes any `AccordRailAdapter` via its `extraRails` option and runs the same six-check probe used against the reference rails. See [ACCORD-009](./ACCORD-009-conformance.md).

## 8. Open questions (v1 candidates)

- **Lightning rail.** Bitcoin Lightning is a clear fit (low value, high frequency, instant). v1.
- **Solana rail.** Same model as Base, different keypair / signature primitives. v1.
- **Cosmos / SDK rails.** IBC-aware adapters. Out of scope for v0.
- **Cross-rail atomic settlement.** When payment is locked on rail A but settled on rail B (HTLC-style). Currently each receipt is single-rail.
