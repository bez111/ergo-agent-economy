# `@accord-protocol/rails-rosen`

Accord rail adapter for **Rosen-bridged stablecoins on Ergo** — `rsUSDT`, `rsUSDC`, `rsBTC`. Same on-chain primitive as `rails-ergo` (R4 reserve / R6 task-hash on an Ergo Note), but the value lives in a wrapped-token amount carried in the box's `tokens[]` array, **not** in the box's nanoERG `value` field.

## Install

```bash
npm install @accord-protocol/rails-rosen @accord-protocol/rails @accord-protocol/core
# peer deps for production use:
npm install ergo-agent-pay ergo-agent-rosen
```

## Token registry — caller-supplied

Token-ids differ between testnet and mainnet, so the rail adapter does NOT bake constants in. Pass a `RosenTokenRegistry` per network:

```ts
import { createRosenRailAdapter } from "@accord-protocol/rails-rosen";

const ROSEN_MAINNET = {
  rsUSDT: { tokenId: "<64 hex>", decimals: 6 },
  rsUSDC: { tokenId: "<64 hex>", decimals: 6 },
  rsBTC:  { tokenId: "<64 hex>", decimals: 8 },
};

const rail = createRosenRailAdapter({ ops: rosenAgent, tokens: ROSEN_MAINNET });
```

The agreement's `price.currency` must be one of `{ rsUSDT, rsUSDC, rsBTC }`, AND the registry must have that currency, AND the registry's `decimals` must match `agreement.price.decimals`. All three rails-rosen-specific rejections — `CURRENCY_NOT_SUPPORTED`, `CURRENCY_NOT_REGISTERED`, `INVALID_PAYMENT_SHAPE` (decimals mismatch) — fire here.

## Buyer payment-proof shape

```json
{
  "note_box_id": "<64 hex>",
  "task_output": "{\"word_count\":2}",
  "receiver_address": "9XSeller..."
}
```

Same shape as `rails-ergo`. The on-chain Note's R4/R5/R6/R7 layout is identical; the wrapped-token value lookup happens against the box's `tokens[]` array.

## verifyPayment checks (in order)

1. **Shape** — `note_box_id` 64-hex, `task_output` present.
2. **Currency / registry** — currency in `{rsUSDT,rsUSDC,rsBTC}`, registry has it, `decimals` match (rejections: `CURRENCY_NOT_SUPPORTED`, `CURRENCY_NOT_REGISTERED`, `INVALID_PAYMENT_SHAPE`).
3. **Note exists on chain** (rejection: `NOTE_NOT_FOUND`).
4. **Not expired** (rejection: `NOTE_EXPIRED`).
5. **Reserve binding** (rejection: `RESERVE_MISMATCH`).
6. **Task-hash binding** — `blake2b256(task_output) === R6` (same as Ergo) (rejections: `TASK_HASH_MISSING`, `TASK_HASH_MISMATCH`).
7. **Token presence** — `tokens[].tokenId == registry[currency].tokenId` (rejection: `TOKEN_NOT_PRESENT`).
8. **Token amount** — carried token amount ≥ `decimalToBaseUnits(price.amount, decimals)` (rejection: `INSUFFICIENT_VALUE`).

On success: `payment_id = note.boxId`.

## settle

Calls `ops.redeemNote(noteBoxId, taskOutput, receiverAddress?)` and emits a Settlement Receipt with:

- `rail: "rosen"`
- `mode: "note_redeemed"` (per-rail allow-list per ACCORD-003: `note_redeemed | reserve_refunded | batch_settled`)
- `status: "settled"` (or `"pending"` if `redeemNote` returns `submitted: false`)

## Error codes (10)

```text
INVALID_PAYMENT_SHAPE
NOTE_NOT_FOUND
NOTE_EXPIRED
RESERVE_MISMATCH
TASK_HASH_MISSING
TASK_HASH_MISMATCH
CURRENCY_NOT_SUPPORTED
CURRENCY_NOT_REGISTERED
TOKEN_NOT_PRESENT
INSUFFICIENT_VALUE
```

## What's NOT here

- **Token-id constants for mainnet/testnet.** Caller-supplied registry on purpose — Rosen Bridge updates these and we don't want stale constants baked in.
- **The bridge itself.** This adapter assumes wrapped tokens are already on Ergo. The actual `wrap` (Ethereum/Bitcoin/Cardano → Ergo) flow lives in `ergo-agent-rosen` and is a separate concern.
- **Refunds.** Rosen Notes self-refund through the Ergo predicate, same as plain Ergo Notes.

## License

MIT.
