# `@accord-protocol/rails-ergo`

Accord rail adapter for the **Ergo Note** primitive. Implements [`AccordRailAdapter`](../accord-rails) by reading a Note from the chain, checking expiry / reserve binding / task-hash / value, then redeeming it.

## Install

```bash
npm install @accord-protocol/rails-ergo @accord-protocol/rails @accord-protocol/core
# plus the upstream Note SDK (peer dep):
npm install ergo-agent-pay
```

## Usage

```ts
import { ErgoAgentPay } from "ergo-agent-pay";
import { createErgoRailAdapter } from "@accord-protocol/rails-ergo";
import { accordGateway } from "@accord-protocol/gateway";

const ergoAgent = new ErgoAgentPay({
  address: process.env.SELLER_ERGO_ADDRESS!,
  network: "testnet",
  signer: mySigner,
});

const rail = createErgoRailAdapter({ ops: ergoAgent });

app.post("/api/run", accordGateway({
  rail,
  resolveAgreement,
  buildAgreementTemplate,
  handler: async (req, { agreement, body }) => {
    return { word_count: String(body?.text ?? "").split(/\s+/).filter(Boolean).length };
  },
}));
```

The adapter never touches `ergo-agent-pay` directly — it expects an `ErgoNoteOps` interface (`checkNote` + `redeemNote` + `network`). The `ErgoAgentPay` class is shape-compatible, so production code passes an instance; tests pass an in-memory stub.

## Buyer payment-proof shape

The buyer's MCP / HTTP call sends:

```json
{
  "note_box_id": "<64 hex>",
  "task_output": "{\"word_count\":2}",
  "receiver_address": "9XSeller..."
}
```

`task_output` is the raw bytes the seller pre-committed to. `blake2b256(task_output)` MUST equal the Note's R6.

## verifyPayment checks (in order)

1. **Shape** — `note_box_id` is 64 hex, `task_output` present.
2. **Note exists** on chain (rejection: `NOTE_NOT_FOUND`).
3. **Not expired** (rejection: `NOTE_EXPIRED`).
4. **Reserve binding** — `note.R4` matches `agreement.payment.reserve_ref` (rejection: `RESERVE_MISMATCH`).
5. **Task-hash binding** — `note.R6` exists and equals `blake2b256(task_output)` (rejections: `TASK_HASH_MISSING`, `TASK_HASH_MISMATCH`).
6. **Currency** — agreement asks for ERG (rejection: `CURRENCY_MISMATCH`; for rsUSDT/rsUSDC/rsBTC use `@accord-protocol/rails-rosen`, for USDC on Base use `@accord-protocol/rails-base`).
7. **Value** — `note.value ≥ decimalToBaseUnits(price.amount, decimals)` (rejection: `INSUFFICIENT_VALUE`).

On success: `payment_id = note.boxId`. The wrapping layer (gateway / MCP) uses this for replay protection.

## settle

Calls `ops.redeemNote(...)` and emits a v0 Settlement Receipt:

```json
{
  "type": "accord.settlement_receipt.v0",
  "version": "v0",
  "rail": "ergo",
  "mode": "note_redeemed",
  "status": "settled",
  "amount": "<agreement.price.amount>",
  "currency": "ERG",
  "decimals": 9,
  "tx": { "network": "...", "tx_id": "...", "box_id": "..." },
  ...
}
```

When `redeemNote` returns `submitted: false` (e.g. unsigned-tx flow), the receipt's `status` is `pending` instead of `settled`.

## Error codes

`ERGO_RAIL_ERROR_CODES`:

```text
INVALID_PAYMENT_SHAPE
NOTE_NOT_FOUND
NOTE_EXPIRED
RESERVE_MISMATCH
TASK_HASH_MISSING
TASK_HASH_MISMATCH
INSUFFICIENT_VALUE
CURRENCY_MISMATCH
```

## What's NOT here

- **Refunds.** Ergo Notes self-refund through the on-chain predicate: when the deadline passes without redemption, the value flows back to the issuer's reserve. There's nothing for the rail adapter to do.
- **Ergo address parsing / NFT-id checks.** Bring your own validation if you don't trust the upstream `ErgoAgentPay`.
- **Stablecoin rails** — `rails-rosen` (rsUSDT/rsUSDC/rsBTC) is a separate package even though it's still on the Ergo chain, because the value semantics + token-id checks differ.

## License

MIT.
