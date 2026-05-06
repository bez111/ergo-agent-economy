# ergo-agent-api

Pay-per-API middleware on top of [`ergo-agent-pay`](../ergo-agent-pay).
An API server drops it in front of paid endpoints and gets:

* on-chain Note verification (value, expiry, predicate)
* atomic replay protection (boxId can only be charged once)
* optional inline redemption (signer-aware, falls back to verify-only)
* a standard 402 response with `Note-Required` and `WWW-Authenticate` headers
* structured `onAccepted` / `onRejected` hooks for accounting and audit

The handler is framework-agnostic. The default adapter is Connect-style
`(req, res, next)` and works with Express, Connect, polka, and anything
else that implements the same shape.

---

## Install

```bash
npm install ergo-agent-api ergo-agent-pay
```

## Quick start (Express)

```ts
import express from "express";
import { ErgoAgentPay } from "ergo-agent-pay";
import { createNotePaymentMiddleware } from "ergo-agent-api";

const app = express();
app.use(express.json());

const agent = new ErgoAgentPay({
  address: process.env.SERVER_ADDRESS!,
  network: "testnet",
  signer: yourServerSigner, // optional — enables inline redemption
});

const requirePayment = createNotePaymentMiddleware({
  agent,
  pricing: {
    "/api/analyze": 1_000_000n,    // 0.001 ERG
    "/api/transcribe": 5_000_000n, // 0.005 ERG
    default: 1_000_000n,
  },
  onAccepted: (event) => {
    console.log(`paid request: ${event.request.path}, boxId=${event.noteBoxId}`);
  },
  onRejected: (event) => {
    console.warn(`refused: ${event.reason} ${event.message}`);
  },
});

app.use(requirePayment);

app.post("/api/analyze", (req, res) => {
  // req.notePayment is set by the middleware
  res.json({ result: { /* ... */ }, payment: req.notePayment });
});

app.listen(3000);
```

## How a paid request looks

```
POST /api/analyze HTTP/1.1
X-Note-Box-Id: 4f9c…a8
X-Task-Output: the answer is 42      # only for predicate-bound Notes
Content-Type: application/json

{ "text": "..." }
```

Without a Note:

```
HTTP/1.1 402 Payment Required
Note-Required: 1000000
WWW-Authenticate: NotePayment header="x-note-box-id"
Content-Type: application/json

{
  "error": "PAYMENT_REQUIRED",
  "message": "Provide a Note box ID in the x-note-box-id header.",
  "required_nano_erg": "1000000",
  "required_erg": "0.001",
  "note_header": "x-note-box-id",
  "task_output_header": "x-task-output"
}
```

---

## Configuration

```ts
interface NotePaymentMiddlewareConfig {
  agent: ErgoAgentPay;
  pricing:
    | bigint                                  // flat fee per request
    | Record<string, bigint>                  // path-keyed; supports a "default" key
    | (req) => bigint | Promise<bigint>;      // full custom

  noteHeader?: string;            // default "x-note-box-id"
  taskOutputHeader?: string;      // default "x-task-output"
  replayStore?: ReplayStore;      // default InMemoryReplayStore (single process)
  redeemStrategy?: "immediate" | "verify-only";  // auto-picks based on signer
  receiverAddress?: string;       // defaults to agent.address
  onAccepted?(event: NotePaymentAccepted): void | Promise<void>;
  onRejected?(event: NotePaymentRejected): void | Promise<void>;
}
```

### `redeemStrategy`

Default: `"immediate"` if the agent has a signer, `"verify-only"` otherwise.

* `"immediate"` — verify, then redeem in-flight. The middleware claims the
  Note's boxId atomically before signing so a duplicate request gets a 409
  REPLAY response, not a double charge.
* `"verify-only"` — verify the Note but do not redeem. Useful when the
  caller wants to batch-redeem out of band (e.g. with `agent.settleBatch`
  on a timer).

### `replayStore`

The default `InMemoryReplayStore` is correct for a single Node process.
For a fleet, plug in a Redis or Postgres store that exposes the same
contract:

```ts
interface ReplayStore {
  tryClaim(boxId: string): Promise<boolean> | boolean;
  release?(boxId: string): Promise<void> | void;
}
```

`tryClaim` MUST be atomic — it is what guarantees that two concurrent
requests for the same boxId see one acceptance and one rejection. The
middleware automatically calls `release` if redemption fails.

### `onAccepted` / `onRejected`

Both hooks fire fire-and-forget; thrown errors are swallowed. If you need
durable accounting, push to a queue or write to a file from the hook.

The accepted event includes the verified `NoteInfo` and, if applicable,
the redemption result (`txId`, `submitted`).

---

## Rejection codes

| Code | HTTP | When |
|---|---|---|
| `PAYMENT_REQUIRED` | 402 | header missing or empty |
| `NOTE_NOT_FOUND` | 402 | boxId did not resolve on chain |
| `NOTE_EXPIRED` | 402 | current height >= R5 |
| `NOTE_INVALID` | 402 | malformed registers (reserved) |
| `VALUE_TOO_LOW` | 402 | Note value < required price |
| `REPLAY` | 409 | boxId was already claimed by this server |
| `REDEMPTION_FAILED` | 502 | signer or submit threw |
| `INTERNAL_ERROR` | 500 | pricing function threw, or unexpected error |

Clients that retry on 402 should refresh the Note (issue a new one). 409
indicates a duplicate the client already paid; do not retry.

---

## Without a framework

For Fastify, Hono, or any non-Connect host, call the underlying
`processPaymentRequest` directly:

```ts
import { processPaymentRequest, resolveConfig } from "ergo-agent-api";

const resolved = resolveConfig({ agent, pricing: 1_000_000n });

server.addHook("preHandler", async (request, reply) => {
  const verdict = await processPaymentRequest(resolved, {
    headers: request.headers as Record<string, string | string[] | undefined>,
    path: request.url.split("?")[0]!,
    method: request.method,
  });
  if (verdict.kind === "rejected") {
    reply.code(402).send({ error: verdict.code, message: verdict.message });
    return;
  }
  request.notePayment = verdict;
});
```

---

## Compatibility with the safety guardrail

The middleware delegates to `agent.checkNote` and `agent.redeemNote`, both
of which inherit the SDK's mainnet guardrail from PR #2. If the agent
config refuses to redeem on mainnet without a compiled `scriptErgoTree`,
the middleware surfaces that as `REDEMPTION_FAILED` and releases the
replay claim so the client can switch networks or supply a script and
retry.
