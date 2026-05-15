# `@accord-protocol/buyer-policy`

Policy enforcer for buyer-side agents. Wraps an integrator-supplied signer with hard-coded spend limits, recipient and rail allow-lists, an approval-required threshold, and atomic per-session budget tracking.

Designed to be embedded in agentic wallets, autonomous trading desks, or any buyer-side gateway where an LLM-driven or automated agent issues payments on a human's behalf and you need a small, auditable layer that says "no" before the signer is even touched.

## Why this exists

Modern agent stacks let an LLM (or any automation) decide when to pay. Without policy, the agent is bounded only by the signer's behaviour — which usually means "signs anything." That is unacceptable for production. This package bounds the blast radius of agent autonomy without taking custody of the key.

Specifically, it enforces these rules **before** the signer runs:

| Rule | Behaviour |
|---|---|
| `maxSinglePayment` | Hard ceiling on any single agreement's price. Even an approved request cannot exceed this. |
| `maxSessionSpend` | Cumulative cap per session. |
| `maxDailySpend` *(optional)* | Rolling 24h cap, tracked per session. |
| `requireApprovalAbove` *(optional)* | Threshold above which the integrator-supplied `approvalHandler` is consulted. Hard timeout. |
| `allowedRecipients` | Allow-list of `agreement.seller.id` values. Suffix wildcards (`provider://repo-audit-*`) supported. |
| `allowedRails` | Allow-list of rails (`ergo`, `rosen`, `base`, `x402`). |

## Install

```bash
npm install @accord-protocol/buyer-policy @accord-protocol/core
```

## Quick start

```ts
import { createBuyerPolicyEnforcer } from "@accord-protocol/buyer-policy";

const enforcer = createBuyerPolicyEnforcer({
  policy: {
    maxSinglePayment:      { amount: "5",  currency: "USD", decimals: 2 },
    maxSessionSpend:       { amount: "50", currency: "USD", decimals: 2 },
    requireApprovalAbove:  { amount: "2",  currency: "USD", decimals: 2 },
    allowedRecipients:     ["provider://repo-audit-v1", "provider://summarizer-*"],
    allowedRails:          ["ergo", "x402"],
  },
  signer: async (unsignedTx, { session_id, agreement_id }) => {
    // Your signer. Receives the unsigned tx for the rail and a context.
    // Never receives the policy state, never receives the private key from us
    // (you already own it).
    return await myWallet.sign(unsignedTx);
  },
  approvalHandler: async (request, abortSignal) => {
    // Push a notification, wait for a tap, return the verdict.
    // Honour abortSignal — the enforcer aborts after `approvalTimeoutMs`.
    return await pushAndAwait(request, { signal: abortSignal });
  },
});

const session = enforcer.openSession({ agentId: "agent://atlas-trader" });

const { signedTx, sessionSpend } = await session.authorize({
  agreement,
  rail: "ergo",
  unsignedTx,
});
```

## Threat model

This package is the small, paranoid layer between your agent and your signer. The defences in scope:

| Threat | Mitigation |
|---|---|
| Time-of-check / time-of-use across concurrent `authorize()` calls | Per-session `AsyncMutex`. Budget is incremented BEFORE the signer is invoked, rolled back if the signer rejects. |
| JS Number precision drift around caps | Every amount is parsed from a decimal string into a BigInt scaled by `decimals`. JS numbers are rejected at the API boundary. |
| Cross-currency comparison | All caps share one `(currency, decimals)`. Mismatched agreement currency rejects with `CURRENCY_MISMATCH`; converting belongs in an oracle layer the integrator wires up. |
| Allow-list bypass via wildcard pattern | Only suffix `*` is honoured. Mid-string or leading wildcards reject at construction. |
| Approval handler hang | `AbortController` + hard timeout (default 60s). Handler exceptions surface as `APPROVAL_HANDLER_ERROR`. |
| Session-id forgery | IDs are 16 random bytes from `crypto.randomBytes`, hex-encoded. Membership lookup uses `timingSafeEqual`. |
| Information leak via error messages | Errors carry typed `code` strings; messages reference field names only — never amount values, agreement bodies, or signer payloads. |
| Mutable policy mid-flight | Parsed policy is frozen at construction. Subsequent edits to the input policy object have no effect. |
| Approval forgery via in-process callback | `approvalHandler` receives only the public-facing facts a human needs. Wiring it to an authenticated channel (push, signed token, separate process) is the integrator's responsibility — but the handler does NOT receive the unsigned tx, the signer state, or any way to influence them beyond `{approved: boolean}`. |

What this package does **not** do (intentionally):

- It does **not** store private keys. Your `signer` function owns the key.
- It does **not** generate or rotate keys.
- It does **not** implement push notifications. You wire those into `approvalHandler`.
- It does **not** persist sessions across processes. In-memory only; if you need durability, build a `SessionStore` in front of `openSession()`.
- It does **not** isolate against malicious code in the same process. If an attacker can `import` this module's internals they can already reach the signer too. Run untrusted code in a separate process with this package on the trusted side.

## Error codes

All deny paths surface as `BuyerPolicyError` with one of these codes. Branch on `err.code`, not on `err.message`.

```text
POLICY_INVALID_CONFIG               – misconfigured policy at construction
POLICY_INVALID_AMOUNT_FORMAT        – non-string amount, bad decimals, etc.
POLICY_INVALID_RECIPIENT_PATTERN    – wildcard in wrong place, too long, etc.
AGREEMENT_INVALID                   – schema validation failed
RAIL_NOT_ALLOWED                    – rail outside allowedRails
RECIPIENT_NOT_ALLOWED               – seller.id outside allowedRecipients
CURRENCY_MISMATCH                   – agreement currency / decimals don't match policy
BUDGET_EXCEEDED_SINGLE              – price > maxSinglePayment
BUDGET_EXCEEDED_SESSION             – spent + price > maxSessionSpend
BUDGET_EXCEEDED_DAILY               – 24h rolling sum + price > maxDailySpend
APPROVAL_REQUIRED_NO_HANDLER        – above threshold but no handler registered
APPROVAL_DENIED                     – handler returned approved: false
APPROVAL_TIMEOUT                    – handler did not return within timeout
APPROVAL_HANDLER_ERROR              – handler threw or returned malformed verdict
SESSION_EXPIRED                     – sessionTtlMs elapsed
SESSION_CLOSED                      – session.close() was called
SIGNER_ERROR                        – signer rejected; budget rolled back
```

## Status

Alpha at v0.4.1. The API is intended to remain stable through the v0.x line; breaking changes will land in a v1 release. Conformance with this package is **not** a registry-level claim — it is a buyer-side hygiene tool.

The package is **not** a substitute for an external audit of the rest of the Accord stack. Mainnet trees and contracts are still gated by the audit manifest workflow described in [ACCORD-010](../../specs/ACCORD-010-security-audit.md).
