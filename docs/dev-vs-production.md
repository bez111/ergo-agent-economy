# Dev mode vs Production mode

`ergo-agent-pay` builds Reserve, Note, and Tracker boxes for the Ergo eUTxO
model. Each of those boxes can be deployed in two modes — and the difference
matters for security in a way that is easy to miss until something goes wrong.
This page explains the modes, the SDK guardrail that separates them, and how
to graduate from one to the other.

The formal definition lives in [`SPEC.md`](../SPEC.md); this document is the
operational companion.

---

## The two modes in one paragraph

In **dev mode**, lifecycle boxes are plain P2PK outputs at the deployer's
address. The contract context — collateralisation rules, expiry, the
acceptance predicate stored in R6 — is advisory only; the address holder
can spend the box as if it were a normal payment.

In **production mode**, each lifecycle box is locked by a compiled ErgoTree
script. The script is the source of truth: a Reserve cannot be unilaterally
drained, a Note cannot be redeemed without satisfying its predicate, a
Tracker enforces double-spend prevention. The registers are no longer hints;
they are typed inputs to a script that the network evaluates.

The SDK refuses to mix the two on mainnet. On testnet you can use either.

---

## Where the modes are decided

Three SDK calls accept an optional `scriptErgoTree`:

```ts
agent.createReserve({ collateral, scriptErgoTree?, memo? })
agent.issueNote({ recipient, value, reserveBoxId, deadline, taskHash?, scriptErgoTree? })
agent.deployTracker({ scriptErgoTree })
```

`scriptErgoTree` is the compiled output of an ErgoScript program — typically
the ChainCash / Basis Reserve, Note, or Tracker contract built with
[`ergo-lib-wasm`](https://github.com/ergoplatform/sigma-rust) or the
[Ergo AppKit](https://github.com/ergoplatform/ergo-appkit).

* If `scriptErgoTree` is set → production mode. The SDK builds an output
  whose locking script is your ergoTree.
* If `scriptErgoTree` is missing → dev mode. The SDK falls back to a P2PK
  output at the deployer/recipient address.

The CLI exposes the same flag as `--script <ergoTree>`.

---

## The mainnet guardrail (two gates)

The SDK enforces a **two-gate guard** before broadcasting on mainnet. See
[`SPEC.md` §6](../SPEC.md#6-production-safety) for the normative version.

### Gate 1 — Box shape

| Network | `scriptErgoTree` | `dangerouslyAllowInsecureMainnetP2PK` | Behaviour |
|---|---|---|---|
| `testnet` | any | any | always allowed |
| `mainnet` | set (non-empty) | any | passes Gate 1 |
| `mainnet` | missing / empty | `true` | passes Gate 1 (explicit opt-in) |
| `mainnet` | missing / empty | not set / `false` | **rejected** with `INSECURE_MAINNET_MODE` |

The legacy alias `allowInsecureDevMode: true` is still honoured but
deprecated; new code should use `dangerouslyAllowInsecureMainnetP2PK`.

```ts
new ErgoAgentPay({
  address,
  network: "mainnet",
  dangerouslyAllowInsecureMainnetP2PK: true, // I have read SECURITY.md and accept P2PK semantics
})
```

…or on the CLI as `--allow-insecure-dev-mode` / `ERGO_ALLOW_INSECURE_DEV_MODE=1`.

Empty-string ergoTrees count as missing — defence in depth against
configuration files that get stripped of secrets in transit.

### Gate 2 — Audited identity

A non-empty `scriptErgoTree` only proves *some* script is attached. Gate 2
requires an `auditPolicy` callback on mainnet that returns
`{ ok: true }` for the supplied tree. The reference policy is
`verifyAuditedErgoTree(...)` from `ergo-agent-scripts`, which checks the
tree's hash against the entries in `data/AUDITED_ERGOTREES.json` and
their `mainnetAllowed` flag.

| Network | `auditPolicy` verdict | `dangerouslyAllowUnauditedErgoTree` | Behaviour |
|---|---|---|---|
| `testnet` | n/a | n/a | always allowed |
| `mainnet` | `{ ok: true }` | any | passes Gate 2 |
| `mainnet` | `{ ok: false }` or throws | any | **rejected** with `UNAUDITED_ERGOTREE` |
| `mainnet` | not configured | `true` | passes Gate 2 (strongly discouraged) |
| `mainnet` | not configured | not set / `false` | **rejected** with `UNAUDITED_ERGOTREE` |

```ts
import { verifyAuditedErgoTree } from "ergo-agent-scripts"

new ErgoAgentPay({
  address,
  network: "mainnet",
  auditPolicy: (tree, name) => verifyAuditedErgoTree(name, tree, { requireMainnet: true }),
})
```

The error codes are `INSECURE_MAINNET_MODE` and `UNAUDITED_ERGOTREE`. The
CLI exits 3 for either case so shell pipelines can tell it apart from a
network failure (1) or an argument error (2). The Base/EVM rail mirrors
the same two gates against `AUDITED_CONTRACTS.json`.

---

## Why dev mode exists at all

Three reasons:

1. **Onboarding.** Compiling an ErgoScript and threading the resulting
   ergoTree through your build is a non-trivial ergonomics tax. Dev mode
   lets a developer go from `npm install` to a working testnet payment in
   minutes — same shape of API, same code path, only the locking script
   differs.
2. **Stub-and-replace integration tests.** Running an end-to-end test
   against a real testnet is fine; running it against a real mainnet just
   to verify protocol shape is wasteful. Dev mode shrinks that loop.
3. **Predicate iteration.** When you are still designing a custom
   acceptance predicate, you don't yet have a stable ergoTree to bind to.
   Dev mode lets you exercise the off-chain shape (registers, hashes,
   context variables) before you commit to the on-chain script.

Mainnet without a script is the failure mode none of those reasons cover.
That is what the guardrail blocks.

---

## What dev mode does *not* protect against

The SDK guardrail only fires when you try to **build** an unsafe transaction.
It cannot retroactively secure boxes already on-chain. Specifically:

* A Note issued in dev mode is spendable by the recipient regardless of
  whether the task output matches `taskHash`. The on-chain `blake2b256`
  check is never evaluated.
* A Reserve created in dev mode is not collateral; it is just funds at your
  P2PK address. Off-chain bookkeeping is the only thing keeping issuers from
  over-issuing Notes.
* A Tracker created in dev mode does nothing — there is no on-chain spent
  set, so the same Note can be "redeemed" twice as far as the chain is
  concerned. The CLI does not even allow `tracker deploy` without
  `--script`, because the very point of a tracker is the script.

Dev-mode UTxOs that get sent to mainnet by mistake do not become safe later.
If you discover one, redeem it back to a clean address before any production
use of that Reserve.

---

## Going to production

The recommended path looks like this:

1. Build everything on testnet with the SDK's defaults (no `scriptErgoTree`).
2. Compile the ChainCash / Basis Reserve, Note, and Tracker scripts you want
   to use. Pin the ergoTree hex in your repo and back-link the source.
3. Add a small wrapper around the SDK that loads your pinned ergoTrees and
   passes them to `createReserve` / `issueNote` / `deployTracker`. Wire
   `auditPolicy: verifyAuditedErgoTree(...)` from `ergo-agent-scripts`
   so Gate 2 fires automatically. Never construct a mainnet
   `ErgoAgentPay` instance with `dangerouslyAllowInsecureMainnetP2PK: true`
   or `dangerouslyAllowUnauditedErgoTree: true` in normal code.
4. Run the same end-to-end flow against mainnet with a tiny Reserve and a
   tiny Note before you scale up. Either gate will refuse to broadcast if
   you forgot to wire the ergoTree or the audit policy.
5. Audit your wrapper. Logging the unsigned EIP-12 transaction before
   signing is a cheap, high-leverage habit; the on-chain effect of an Ergo
   transaction is fully described by its EIP-12 form.

If you find yourself reaching for `dangerouslyAllowInsecureMainnetP2PK: true`
or `dangerouslyAllowUnauditedErgoTree: true` because something else is in the
way, treat that as a signal to stop and fix the upstream issue rather than
disabling a guardrail.

---

## See also

* [`SPEC.md`](../SPEC.md) — formal Reserve / Note / Tracker / Predicate v0.
* [`SECURITY.md`](../SECURITY.md) — threat model and reporting flow.
* [`packages/ergo-agent-pay/src/safety.ts`](../packages/ergo-agent-pay/src/safety.ts) — the `assertProductionSafety` helper.
* [`packages/ergo-agent-cli`](../packages/ergo-agent-cli) — the CLI and its safety flags.
