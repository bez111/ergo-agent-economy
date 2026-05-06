# Policy Engine

`ergo-agent-pay` ships a small policy engine that wraps every `pay()`,
`issueNote()`, `redeemNote()`, and `settleBatch()` call. It is the place to
say things like "this agent can spend at most 1 ERG per day", "only pay these
three vendors", or "anything over 0.1 ERG needs a Telegram approval". The
engine is opt-in: an empty config behaves like no policy at all.

The engine has v1 and v2 features. Everything in v1 still works unchanged;
v2 adds five orthogonal capabilities on top.

---

## Configuration shape

```ts
new ErgoAgentPay({
  address,
  network: "testnet",
  policy: {
    // ── v1 ──
    maxSinglePayment: 5_000_000n,        // nanoERG
    maxSessionSpend: 50_000_000n,
    requireApprovalAbove: 10_000_000n,
    approvalFn: async (ctx) => { /* prompt user, return boolean */ },
    beforePay: async (ctx) => true,
    afterPay: async (ctx, result) => { /* log */ },

    // ── v2 ──
    perRecipientCap: { "9XAlpha…": 1_000_000n },
    recipientAllowlist: ["9XAlpha…", "9XBeta…"],
    recipientBlocklist: ["9XKnownBad…"],
    dailyBudget: 100_000_000n,
    auditLog: (event) => { /* persist event */ },
  },
})
```

Every field is optional. Bigints are nanoERG.

---

## Decision order

```
recipientBlocklist  →  recipientAllowlist  →  perRecipientCap (or maxSinglePayment)
                    →  maxSessionSpend     →  dailyBudget
                    →  requireApprovalAbove → approvalFn
                    →  beforePay
```

Each step throws `ErgoAgentPayError` immediately if it fails; later steps
are not consulted. The error always has a `code` and a human-readable
`message`.

---

## v2 features

### `recipientBlocklist` / `recipientAllowlist`

Either is accepted as `string[]` or `Set<string>`. The blocklist always
wins — a blocklisted address is rejected even if it also appears in the
allowlist.

```ts
{
  recipientBlocklist: ["9XKnownBad"],
  recipientAllowlist: ["9XAlpha", "9XBeta"], // anything else is rejected
}
```

### `perRecipientCap`

Single-payment caps that override `maxSinglePayment` for specific addresses.
Recipients not in the map fall back to `maxSinglePayment` if any.

```ts
{
  maxSinglePayment: 5_000_000n,                       // global
  perRecipientCap: { "9XAlpha": 50_000_000n },        // override for 9XAlpha
}
```

Accepts `Record<string, bigint>` or `Map<string, bigint>`.

### `dailyBudget`

Maximum total spend per UTC day. Resets at 00:00 UTC. The engine tracks the
current epoch day internally; pass `now: () => number` for tests.

```ts
{ dailyBudget: 100_000_000n }
```

`engine.totalDailySpend` returns the post-roll value.

### `auditLog`

Structured sink for every policy decision. Receives:

```ts
type AuditLogEvent =
  | { kind: "before"; ctx: PayContext; allowed: true }
  | { kind: "before"; ctx: PayContext; allowed: false; reason: string; code: ErgoAgentPayErrorCode }
  | { kind: "after";  ctx: PayContext; result: PayResult };
```

Errors thrown from the sink are swallowed — audit failures must never break
payment flow. If durability matters, the sink should append to a file, push
to a queue, or otherwise persist before returning.

```ts
{
  auditLog: (event) => {
    if (event.kind === "before" && event.allowed === false) {
      logger.warn({ event }, "policy rejected payment");
    } else {
      logger.info({ event }, "policy event");
    }
  },
}
```

### `now`

Optional clock injection for tests. Defaults to `Date.now`.

---

## Approval plugins

`approvalFn` is intentionally just a callback — it's where you bolt on
Telegram, Slack, Discord, Pushover, or a CLI prompt. There is no built-in
plugin in v2; the goal is to keep the SDK dependency-free. Sample shape:

```ts
{
  requireApprovalAbove: 10_000_000n,
  approvalFn: async (ctx) => {
    const reply = await telegramAskApproval({
      to: ctx.to,
      amountErg: Number(ctx.value) / 1e9,
    });
    return reply === "approved";
  },
}
```

---

## Reading state

The class exposes:

| Property / method | Meaning |
|---|---|
| `engine.totalSessionSpend` | nanoERG spent in the current session |
| `engine.totalDailySpend`   | nanoERG spent in the current UTC day (post-roll) |
| `engine.resetSession()`    | resets session counter; daily counter is unaffected |

`ErgoAgentPay` exposes `agent.sessionSpend` and `agent.resetSession()` as
shortcuts.

---

## What this is not

- **It does not sign or submit transactions.** It only decides whether a
  payment may be built. Pair it with the SDK or a host process that
  controls the signer.
- **It does not persist state across processes.** Session and daily
  counters live in the engine instance. Persist them yourself if you need
  hard guarantees across restarts.
- **It does not authenticate the recipient address.** Allowlists are
  string-equality only; if you derive recipients from agent input, validate
  them upstream.
