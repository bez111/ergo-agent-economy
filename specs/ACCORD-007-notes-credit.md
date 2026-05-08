# ACCORD-007 — Notes & Credit

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`packages/ergo-agent-pay`](../packages/ergo-agent-pay/), [`packages/agentpay-base`](../packages/agentpay-base/), [`packages/ergo-agent-scripts`](../packages/ergo-agent-scripts/) |

## 1. Purpose

A **Note** is the rail-level instrument an Accord engagement settles against. Notes are the implementation detail that makes the Accord-level promise — *"payment iff completion"* — enforceable on-chain (or facilitator-attested for x402).

This spec describes how the abstract Accord agreement / payment / settlement model maps onto two concrete Note implementations (Ergo + Base/EVM) and a degenerate facilitator-flow (x402). It also defines what "credit Notes" mean for v0 and what's reserved for v1.

## 2. The Note as a rail primitive

A Note carries:

- **A value.** Either the box's nanoERG value (Ergo / Rosen) or an ERC-20 token amount (Base) or a facilitator-signed payment payload (x402).
- **A reserve binding.** Which Reserve the Note is drawn against (Ergo R4) or which contract holds the locked funds (Base).
- **An expiry.** Block height (Ergo / Base) or seconds (x402).
- **An acceptance predicate.** What the seller must produce for the payment to release. v0: `blake2b256(taskOutput) == taskHash` on Ergo / Rosen, `keccak256(taskOutput) == taskHash` on Base, facilitator-defined on x402.
- **(Optional) credential binding.** When present, only the credential holder can redeem.

When the seller redeems with the matching `taskOutput`, value flows to the seller. When the deadline passes without redemption, value flows back to the issuer (refund).

## 3. Mapping to Accord objects

### 3.1 Issue (lock)

The buyer creates a Note referencing:

- **Reserve** for the funds (Ergo: R4 = reserve box id; Base: implicit, the Reserve contract owns the value)
- **Recipient** = the seller's address / EVM address
- **Value** quantised from `agreement.price.amount` × 10^`decimals`
- **Expiry** derived from `agreement.payment.deadline` (e.g. `+480 blocks` → block-height current+480)
- **Task hash** = the rail's hash function applied to the bytes the buyer pre-committed to. The hash is what eventually gets matched against `taskOutput` at redemption.

The buyer's payment proof to the seller is the resulting `note_box_id` (Ergo / Rosen) or `note_id` + `tx_hash` (Base) or the signed `x402_payment_payload`.

### 3.2 Verify (rail-side, before serving)

`@accord-protocol/rails-{ergo,rosen,base,x402}`'s `verifyPayment` confirms the Note exists, isn't expired, references the right reserve, has the right task-hash, and carries enough value. The seller's wrapper rejects the call before running the handler if any check fails.

### 3.3 Redeem (settle)

After the seller produces the work, the seller's wrapper calls `rail.settle(...)` which redeems the Note against the on-chain predicate (Ergo / Rosen / Base) or finalises the facilitator settle (x402). The redeem transaction puts the value into the seller's wallet and emits the data the Settlement Receipt records.

### 3.4 Refund (deadline path)

| Rail | Refund flow |
|---|---|
| Ergo / Rosen | Self-refund via the on-chain predicate. After expiry, anyone (typically the issuer) can spend the Note back into the Reserve. The rail adapter does not need a `refund` method. |
| Base | Explicit `refundExpired(noteId)` contract call. The `@accord-protocol/rails-base` adapter exposes `refund` for this. |
| x402 | Pay-before-response by design — refund-after-deadline is not a v0 concept. Operationally: the facilitator's TTL on the payment authorization expires the unused payload. |

## 4. Credit Notes (v0)

A **credit Note** in v0 is just a Note backed by a Reserve that the issuer hasn't pre-funded the full value of. Examples:

- Ergo ChainCash: a Reserve with collateral C can issue Notes summing to C; if the issuer is trusted, downstream agents may further endorse them. The `chaincash_*_v0` predicates in [`ergo-agent-scripts`](../packages/ergo-agent-scripts/data/sources/) enforce this.
- Base AgentPayReserveV0: the issuer top-ups the contract once and issues many Notes against the balance.

**v0 does NOT specify cross-rail credit.** A Note on Ergo cannot back a settlement on Base in v0. v1 may add a "rail-bridge Note" abstraction.

## 5. Reserve

The Reserve is the on-chain box (Ergo) or contract (Base) that holds the issuer's collateral. Multiple Notes can be issued against the same Reserve.

For ChainCash (Ergo), the Reserve script enforces invariants like `R5` preservation across actions (top-up / mint / redeem). Audit findings on these invariants are tracked in [`docs/audit/DEEP_REVIEW.md`](../docs/audit/DEEP_REVIEW.md).

For Base, the AgentPayReserveV0 contract is a single-issuer Reserve — funds in, Notes out, redemptions tracked in a `redeemed` flag per Note.

## 6. Tracker

A **Tracker** is the optional anti-double-spend registry layer on Ergo. When two parties share a Tracker, they can settle multiple Notes in one batched transaction without each Note hitting the chain individually. v0's reference implementation uses Tracker for the `batch_settled` settlement mode.

The Tracker is its own audited tree (`tracker_v0`) in the manifest. Base/EVM does not have an analogous primitive in v0 — each settlement is its own tx.

## 7. Acceptance predicate v0

Three predicate variants ship in v0:

| Name | What it checks | Front-running risk |
|---|---|---|
| `task_hash_v0` | `blake2b256(getVar[Coll[Byte]](0)) == SELF.R6` and `HEIGHT < SELF.R5` | **YES — front-runnable after the task output appears in the mempool.** v0 manifest pins this `mainnetAllowed: false` permanently. |
| `credential_v0` | Same as `task_hash_v0` plus `proveDlog(SELF.R7[GroupElement].get)` (the credential key) | Receiver-bound: a copied taskOutput cannot redeem to a different address. **This is the predicate mainnet engagements should use.** |
| `chaincash_*_v0` (reserve / receipt / note) | Full ChainCash semantics — see source | Audit-blocking findings; see [`docs/audit/DEEP_REVIEW.md`](../docs/audit/DEEP_REVIEW.md) |

Conformant implementations MUST use `credential_v0` (or a future receiver-bound v0) for mainnet payments. The `task_hash_v0` predicate is testnet/demo only and the SDK refuses to promote it.

## 8. Open questions (v1 candidates)

- **Cross-rail credit.** Note on rail A backing settlement on rail B.
- **Multi-recipient Notes.** Splitting a single Note across multiple sellers (provider + verifier + platform fee).
- **Variable-amount Notes.** v0 Notes are fixed-value; pay-per-token streaming wants variable.
- **On-chain dispute resolution.** v0 disputes are off-chain (`accord.dispute_receipt.v0`); v1 may add an on-chain dispute predicate.
- **Notes denominated in non-currency units.** "1 inference" instead of "0.001 ERG" — needs a settlement-to-value conversion layer.
- **STARK-verified ChainCash Notes (pending [EIP-0045](https://www.ergoforum.org/t/eip-0045-x-chaincash-how-native-stark-verification-solves-privacy-scalability-defi-compatibility/5318)).** If Ergo lands native STARK opcodes, ChainCash predicates can move from O(N)-per-signature verification to O(1) recursive proofs and optionally hide the payment graph. On the Accord side this would surface as a new `chaincash_stark_v1` predicate entry in the audit manifest; Note shape and the three Accord receipts are unaffected. Tracked here, not scheduled — depends on a soft-fork outside this repo.
