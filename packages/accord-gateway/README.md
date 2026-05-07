# `@accord-protocol/gateway`

**Accord/402 HTTP middleware.** Connect / Express compatible. Turn any HTTP endpoint into a paid, verifiable Accord engagement: 402 challenge with agreement template, replay-protected payment verification, structured error envelope, optional verifier hook, optional settlement.

Rail-agnostic — takes any `AccordRailAdapter`. Reference rail adapters land separately as `@accord-protocol/rails-{ergo,base,x402}`.

## Install

```bash
npm install @accord-protocol/gateway @accord-protocol/core
```

## Quickstart

```ts
import express from "express";
import { accordGateway, type AccordRailAdapter } from "@accord-protocol/gateway";

const app = express();
app.use(express.json());

const rail: AccordRailAdapter = {
  rail: "ergo",
  async verifyPayment({ agreement, payment }) {
    // …call your real Note verifier here
    return { ok: true, rail: "ergo", payment_id: "<note-box-id>" };
  },
  async settle({ agreement }) {
    return { /* AccordSettlementReceipt */ } as never;
  },
};

app.post("/api/run", accordGateway({
  rail,
  resolveAgreement: async (id) => store.get(id),
  buildAgreementTemplate: () => ({
    agreement_template: "https://provider.example/.well-known/accord/agreement-template",
    price: { amount: "0.05", currency: "USDC", decimals: 6 },
    accepted_rails: ["ergo", "rosen", "base", "x402"],
    verification_required: false,
  }),
  handler: async (req, { agreement, body }) => {
    return { word_count: String(body?.text ?? "").split(/\s+/).filter(Boolean).length };
  },
}));

app.listen(3000);
```

## Per-request flow

```text
1. Read X-Accord-* headers
2. resolveAgreement(id)                       → 402 with template if unknown
3. validateAgreement(agreement)               → 400 if cross-field problems
4. JSON.parse(X-Accord-Payment)               → 402 if missing
5. rail.verifyPayment(...)                    → 402 if rejected, 502 if threw
6. replayStore.has/put(rail, payment_id)      → 402 if same id replayed
7. (optional) accord_task_output hash check   → 400 if mismatch
8. handler(req, { agreement, body })          → 500 if threw
9. (if required) verifier(...) + validate     → 422 if rejected/invalid
10. (best-effort) rail.settle(...)            → swallowed, attached to _meta
11. 200 with { output, _meta } JSON body + Accord headers
```

## 402 challenge response

```http
HTTP/1.1 402 Payment Required
Accord-Version: v0
Accord-Agreement-Required: true
Accord-Agreement-Template: https://provider.example/.well-known/accord/agreement-template
Accord-Accepted-Rails: ergo,rosen,base,x402
WWW-Authenticate: Accord402
Content-Type: application/json

{
  "error": "ACCORD_PAYMENT_REQUIRED",
  "agreement_template": "https://provider.example/.well-known/accord/agreement-template",
  "price": { "amount": "0.05", "currency": "USDC", "decimals": 6 },
  "accepted_rails": ["ergo", "rosen", "base", "x402"],
  "verification_required": false
}
```

## Replay protection

Default: in-process `Map`-backed `InMemoryReplayStore` with a 24h TTL. Suitable for dev / tests / single-process demos. For production, plug in a Redis-backed implementation:

```ts
import type { AccordReplayStore } from "@accord-protocol/gateway";

const replayStore: AccordReplayStore = {
  has: async (rail, id) => (await redis.exists(`replay:${rail}:${id}`)) === 1,
  put: async (rail, id, expiresAtMs) => {
    const ttlSec = Math.max(1, Math.floor((expiresAtMs - Date.now()) / 1000));
    await redis.setex(`replay:${rail}:${id}`, ttlSec, "1");
  },
};
```

The interface is intentionally tiny — two methods.

## Error codes

| Code | HTTP |
|---|---|
| `ACCORD_PAYMENT_REQUIRED` | 402 |
| `UNKNOWN_AGREEMENT` | 402 |
| `MISSING_PAYMENT` | 402 |
| `AGREEMENT_INVALID` | 400 |
| `PAYMENT_VERIFICATION_FAILED` | 402 |
| `RAIL_UNAVAILABLE` | 502 |
| `REPLAY_DETECTED` | 402 |
| `TASK_OUTPUT_HASH_MISMATCH` | 400 |
| `HANDLER_THREW` | 500 |
| `VERIFICATION_REQUIRED` | 422 |
| `VERIFICATION_REJECTED` | 422 |

## What's NOT in this package

- Rail adapter implementations (Ergo / Rosen / Base / x402) → `@accord-protocol/rails-*`
- x402 compatibility shim — that's `@accord-protocol/x402` (PR-016 in the open-source roadmap)
- A bundled JSON parser — bring your own (`express.json()`, `body-parser`, etc.). The middleware only reads headers and `req.body`.
- Conformance tests → `@accord-protocol/conformance`

## License

MIT.
