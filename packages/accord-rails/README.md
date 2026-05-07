# `@accord-protocol/rails`

Shared **rail-adapter interface** that `@accord-protocol/mcp`, `@accord-protocol/gateway`, and the rail-specific `@accord-protocol/rails-{ergo,base,rosen,x402}` packages all agree on.

A rail adapter has three responsibilities:

1. **`verifyPayment(...)`** — confirm the buyer's payment proof is good and return a stable `payment_id` for replay protection.
2. **`settle(...)`** *(optional)* — close out the economic side, return a Settlement Receipt.
3. **`refund(...)`** *(optional)* — return funds when the engagement fails past the deadline.

Rail adapters are **pure objects** — no global state. The wrapping layer (gateway / MCP) supplies replay storage, agreement resolution, and receipt persistence. The rail's only job is to talk to its underlying payment system.

## Install

```bash
npm install @accord-protocol/rails @accord-protocol/core
```

## Implementing a rail

```ts
import type { AccordRailAdapter } from "@accord-protocol/rails";

export const myRail: AccordRailAdapter = {
  rail: "ergo",
  async verifyPayment({ agreement, payment }) {
    const note = await checkNote(payment.note_box_id);
    if (note.value < BigInt(agreement.price.amount)) {
      return { ok: false, rail: "ergo", code: "INSUFFICIENT_VALUE", message: `note value ${note.value} < required ${agreement.price.amount}` };
    }
    return { ok: true, rail: "ergo", payment_id: note.box_id };
  },
  async settle({ agreement, payment }) {
    const tx = await redeemNote(payment.note_box_id);
    return { /* AccordSettlementReceipt with rail="ergo", mode="note_redeemed" */ } as never;
  },
};
```

## Mock adapter for tests / demos

`@accord-protocol/rails/mock` ships a deterministic in-memory rail you can drop in anywhere a real rail is expected:

```ts
import { MockRailAdapter } from "@accord-protocol/rails/mock";

const rail = new MockRailAdapter();
// honest mode (default): accepts iff payment.value ≥ agreement.price.amount
// always_accept / always_reject / throw modes for failure-injection tests
```

The mock derives `payment_id` deterministically from the payment's canonical-JSON hash, emits valid Settlement Receipts that pass `@accord-protocol/core`'s `validateSettlementReceipt`, and supports both `settle` and `refund`. Used in this repo's gateway / MCP test suites and conformance fixtures.

## Per-rail conventions

| Rail | `payment_id` | Settlement `mode` |
|---|---|---|
| `ergo` | Note box id | `note_redeemed` / `reserve_refunded` / `batch_settled` |
| `rosen` | Note box id (rsUSDT/rsUSDC/rsBTC) | same as `ergo` |
| `base` | EVM tx hash | `redeemed` / `refund_expired` |
| `x402` | facilitator-issued payment proof id | `paid_before_response` |

These match the per-rail allow-list in `@accord-protocol/core`'s `RAIL_MODE_ALLOWLIST`.

## License

MIT.
