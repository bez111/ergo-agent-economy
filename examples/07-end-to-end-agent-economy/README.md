# 07 — End-to-end agent economy

Composes every package shipped in this repo into one runnable story: an
agent pays another agent's API in real Ergo Notes, with policy controls,
replay protection, on-chain predicate verification, and audit logging.

This is the "10 minutes to magic" demo — the headline scenario the rest
of the repo exists to support.

```
┌──────────────────┐                       ┌──────────────────┐
│  Buyer agent     │ ── X-Note-Box-Id ──▶  │  Seller API      │
│  (TS / Python)   │     X-Task-Output     │  (Express +      │
│                  │ ◀── 200 result   ──   │   middleware)    │
└────────┬─────────┘                       └────────┬─────────┘
         │ issueNote                                │ redeemNote
         ▼                                          ▼
   ergo-agent-server  ── REST ──▶  Ergo testnet ◀── ergo-agent-pay
   (signing daemon)                                  (server signer)
```

## Pieces in play

| Package | Role here |
|---|---|
| [`ergo-agent-pay`](../../packages/ergo-agent-pay) | SDK both sides drive: `issueNote`, `redeemNote`, policy engine. |
| [`ergo-agent-scripts`](../../packages/ergo-agent-scripts) | Provides the compiled `task_hash_v0` ergoTree so the buyer's Note carries a real on-chain predicate. |
| [`ergo-agent-api`](../../packages/ergo-agent-api) | Express middleware that verifies the Note, enforces replay, redeems inline. |
| [`ergo-agent-server`](../../packages/ergo-agent-server) | Local HTTP daemon for the buyer (so a Python agent can drive the SDK). |
| [`ergo-agent-py`](../../packages/ergo-agent-py) | `BridgeClient` — Python buyer talks to the daemon. |

## What happens, step by step

1. **Seller starts an API**. `server.ts` boots an Express app behind
   `createNotePaymentMiddleware` with the `task_hash_v0` ergoTree from
   `ergo-agent-scripts`. Pricing is path-keyed; the seller's signer is
   wired so the middleware redeems Notes inline.
2. **Buyer issues a Note**. `agent.ts` uses an `ErgoAgentPay` policy
   engine v2 (per-recipient cap + audit log). It calls `issueNote` with
   the seller's address as recipient, the seller's task output as
   `taskOutput` (auto-hashed to BLAKE2b-256 → R6), and the compiled
   `task_hash_v0` tree as `scriptErgoTree`. The result is a real Note on
   Ergo testnet.
3. **Buyer calls the API**. The HTTP request carries the Note's
   `boxId` in `X-Note-Box-Id` and the task output the seller expects in
   `X-Task-Output`. (Header names match `ergo-agent-api` defaults.)
4. **Seller verifies & redeems**. The middleware:
   - reads `X-Note-Box-Id`, claims the boxId atomically against
     `InMemoryReplayStore`,
   - calls `agent.checkNote` to fetch the box and decode R5 / R6,
   - confirms `note.value >= price`, `!isExpired`,
   - calls `agent.redeemNote({ taskOutput })` — the seller's signer
     produces and submits the redemption TX, with the task output
     injected as context variable 0,
   - on success, attaches `req.notePayment` and routes to the actual
     handler. On failure, it releases the boxId claim and returns 402 /
     409 / 502 with a stable `code`.
5. **Buyer receives the result.** The API response body is identical to
   what the same endpoint would return without the paywall. The
   `X-Note-Status: redeemed` header (set by the demo handler) confirms
   the boxId is no longer redeemable by anyone else.

The Python buyer is `agent.py`. It uses `BridgeClient` to drive the
daemon and `urllib` to call the API. Functionally identical to
`agent.ts`; same Notes, same policy.

## Run it

You need:

* Node 18+, Python 3.10+
* A funded Ergo **testnet** address (free ERG from
  [testnet.ergofaucet.org](https://testnet.ergofaucet.org))
* Two environment variables: `BUYER_ADDRESS`, `SELLER_ADDRESS`
* A signer for the seller — the demo accepts an `EIP12_SIGNER_URL`
  pointing at a Nautilus signing endpoint or a similar HTTP-signer

```bash
# Terminal 1 — seller API
cd examples/07-end-to-end-agent-economy
npm install
SELLER_ADDRESS=9X... node server.ts

# Terminal 2 — buyer (TypeScript)
BUYER_ADDRESS=9Y... node agent.ts

# Terminal 2' — buyer (Python)
BUYER_ADDRESS=9Y... python3 agent.py
```

The signer wiring is intentionally left as `process.env.EIP12_SIGNER_URL`
so the demo doesn't ship a private key. For a fully self-contained run,
substitute a `seedSigner` (Fleet SDK) — that's a one-line change in
`server.ts`.

## Where each safety property comes from

| Guarantee | Comes from |
|---|---|
| Hash function matches on-chain check | PR #2 — BLAKE2b-256 across SDK + golden vectors |
| No accidental P2PK on mainnet | PR #2 — `assertProductionSafety` |
| Per-recipient budget cap | PR #5 — `policy.perRecipientCap` |
| Daily spend cap | PR #5 — `policy.dailyBudget` |
| Structured audit | PR #5 — `policy.auditLog` |
| Verified Note on every request | PR #6 — middleware verifies via `agent.checkNote` |
| One-shot Note redemption | PR #6 — `InMemoryReplayStore.tryClaim` |
| Inline redemption | PR #6 — `redeemStrategy: "immediate"` |
| Python participation | PR #7 — daemon + BridgeClient |
| On-chain predicate enforcement | PR #8 — `tryGetErgoTree("task_hash_v0")` |

The demo is the place these pieces compose; the actual safety logic
lives in the packages so any combination works without recompiling.
