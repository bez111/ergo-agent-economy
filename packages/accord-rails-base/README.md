# `@accord-protocol/rails-base`

Accord rail adapter for the **Base / EVM Note** primitive (`AgentPayReserveV0` Solidity contract). Implements [`AccordRailAdapter`](../accord-rails) by reading a Note from the Solidity contract, checking expiry / receiver binding / task-hash / value, then redeeming or refunding.

## Install

```bash
npm install @accord-protocol/rails-base @accord-protocol/rails @accord-protocol/core
# plus the EVM Note SDK (peer dep):
npm install agentpay-base
```

## Usage

```ts
import { BaseAgentPay } from "agentpay-base";
import { createBaseRailAdapter } from "@accord-protocol/rails-base";
import { accordGateway } from "@accord-protocol/gateway";

const baseAgent = new BaseAgentPay({
  reserveAddress: "0x…",
  network: "base-sepolia",
  walletClient,
});

const rail = createBaseRailAdapter({ ops: baseAgent });

app.post("/api/run", accordGateway({
  rail,
  resolveAgreement,
  buildAgreementTemplate,
  handler: async (req, { agreement, body }) => ({ /* … */ }),
}));
```

The adapter never imports `agentpay-base` directly — it expects a `BaseNoteOps` interface (`network` + `checkNote` + `redeemNote` + optional `refundExpired`). `BaseAgentPay` is shape-compatible. Tests pass an in-memory stub.

## Buyer payment-proof shape

```json
{
  "note_id": "0x<64 hex>",
  "task_output": "{\"word_count\":2}",
  "tx_hash": "0x<64 hex>"
}
```

`task_output` is the raw bytes the seller pre-committed to. `keccak256(task_output)` MUST equal the on-chain Note's `taskHash`.

## verifyPayment checks (in order)

1. **Shape** — `note_id` is `0x` + 64 hex, `task_output` present.
2. **Note exists on chain** — `note.exists` (rejection: `NOTE_NOT_FOUND`).
3. **Not already redeemed** (rejection: `NOTE_ALREADY_REDEEMED`).
4. **Not expired** (rejection: `NOTE_EXPIRED`).
5. **Currency** — agreement asks for USDC or USDT (rejection: `CURRENCY_NOT_SUPPORTED`; for ERG use `rails-ergo`, for rsUSDT/rsUSDC/rsBTC use `rails-rosen`).
6. **Task-hash binding** — `note.taskHash != 0x00…` and equals `keccak256(task_output)` (rejections: `TASK_HASH_MISSING`, `TASK_HASH_MISMATCH`). Note: keccak256, not blake2b256 — Accord stays portable, the rail uses each chain's native hash.
7. **Value** — `note.amount >= decimalToBaseUnits(price.amount, decimals)` (rejection: `INSUFFICIENT_VALUE`).

On success: `payment_id = tx_hash` (preferred — anchors to a specific issuance tx), or `note_id` if `tx_hash` was absent.

## settle / refund

- **`settle`** — calls `ops.redeemNote(noteId, taskOutput)`. Emits a v0 Settlement Receipt with `mode: "redeemed"`, `status: "settled"`.
- **`refund`** — calls `ops.refundExpired(noteId)`. Emits with `mode: "refund_expired"`, `status: "refunded"`. Required when the engagement fails past the deadline.

The Base rail's per-rail allow-list per ACCORD-003 is `{ "redeemed", "refund_expired" }`; the adapter respects that.

## Error codes

`BASE_RAIL_ERROR_CODES`:

```text
INVALID_PAYMENT_SHAPE
NOTE_NOT_FOUND
NOTE_EXPIRED
NOTE_ALREADY_REDEEMED
TASK_HASH_MISSING
TASK_HASH_MISMATCH
INSUFFICIENT_VALUE
CURRENCY_NOT_SUPPORTED
```

## License

MIT.
