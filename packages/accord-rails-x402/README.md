# `@accord-protocol/rails-x402`

Accord rail adapter for **x402-compatible HTTP payments**. Wraps any [x402 facilitator](https://github.com/coinbase/x402) (Coinbase's hosted one, a self-hosted shim, or a test stub) into the [`AccordRailAdapter`](../accord-rails) shape.

This is the rail that lets x402 endpoints **upgrade into Accord agreements** — keep paying USDC on Base via x402, get verifiable Accord work-receipts on top.

## Install

```bash
npm install @accord-protocol/rails-x402 @accord-protocol/rails @accord-protocol/core
```

No other dependencies — the facilitator is pluggable, you wire whichever HTTP client (or stub) you want.

## Usage

```ts
import { createX402RailAdapter, type X402Facilitator } from "@accord-protocol/rails-x402";

const facilitator: X402Facilitator = {
  network: "base-sepolia",
  async verify({ agreement, paymentPayload, scheme }) {
    const r = await fetch("https://x402.coinbase.com/verify", {
      method: "POST",
      body: JSON.stringify({ /* per facilitator API */ }),
    });
    const json = await r.json();
    return json.ok
      ? { ok: true, payment_id: json.payment_id, scheme: json.scheme, payer: json.payer }
      : { ok: false, code: json.code, message: json.message };
  },
  async settle({ agreement, paymentPayload, payment_id }) {
    const r = await fetch("https://x402.coinbase.com/settle", { /* … */ });
    const json = await r.json();
    return { tx_hash: json.tx_hash, block_height: json.block_height };
  },
};

const rail = createX402RailAdapter({ facilitator });
```

## How x402 maps to Accord

Per [ACCORD-003](../../specs/ACCORD-003-settlement-receipt.md), the x402 rail's only mode is **`paid_before_response`** — payment is verified atomically, the response goes back, the buyer either got the work or didn't pay.

Receipt shape:

```json
{
  "type": "accord.settlement_receipt.v0",
  "rail": "x402",
  "mode": "paid_before_response",
  "status": "settled",
  "tx": { "tx_id": "<facilitator-issued payment_id>", "network": "base-sepolia", "block_height": ... }
}
```

`payment_id` (from the facilitator) doubles as the receipt's `tx_id` when the facilitator doesn't expose a separate `settle` endpoint — typical for facilitator-broker setups where verify and submit happen in one round-trip.

## Buyer payment-proof shape

```json
{
  "x402_payment_payload": "<base64 of facilitator's PaymentPayload>",
  "scheme": "exact"
}
```

The payload is opaque — for Coinbase's facilitator on Base it's an EIP-3009 `transferWithAuthorization` signature. The adapter doesn't decode it; it hands it to the facilitator.

## verifyPayment checks (in order)

1. **Shape** — `x402_payment_payload` is a non-empty string.
2. **Currency** — agreement asks for USDC or USDT (rejection: `CURRENCY_NOT_SUPPORTED`; for ERG use `rails-ergo`, for rsUSDT/rsUSDC/rsBTC use `rails-rosen`, for native ERC-20 paywalled-Note flows use `rails-base`).
3. **`facilitator.verify(...)`** — the rail of last resort. Returns `ok` + `payment_id` or a structured rejection.
   - On `ok: false` → `FACILITATOR_REJECTED`.
   - On thrown → `FACILITATOR_UNAVAILABLE`.

On success: `payment_id` is whatever the facilitator returns (typically the EVM tx hash that will land the payment).

## settle behaviour

`settle()` re-calls `facilitator.verify(...)` (idempotent under x402's stateless contract) to get a fresh `payment_id`, then optionally calls `facilitator.settle(...)` for the real on-chain `tx_hash`. If the facilitator doesn't expose `settle`, the adapter still returns a `settled` Settlement Receipt using `payment_id` as the tx id — typical for facilitator-flow x402 where verify and submit happen in the same step.

## Error codes

`X402_RAIL_ERROR_CODES`:

```text
INVALID_PAYMENT_SHAPE
FACILITATOR_REJECTED
FACILITATOR_UNAVAILABLE
CURRENCY_NOT_SUPPORTED
```

## Why this exists

> *x402 verifies payment. Accord verifies completion.*

x402 alone gives you a paid request; Accord adds the agreement object, the verifier hook, the dispute trail, and the cross-rail settlement registry. The `rails-x402` adapter is the **bridge**: existing x402 providers can join Accord without changing payment rails. Set price + verification rules in an Accord Agreement, accept the same x402 X-PAYMENT header, return Accord Verification + Settlement Receipts on top.

## License

MIT.
