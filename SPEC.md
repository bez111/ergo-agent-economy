# AgentPay Protocol — v0 Specification

Status: **v0 (draft, testnet-only)**
Audience: SDK implementers, security reviewers, integrators.

This document defines the wire-level behaviour every `ergo-agent-pay`
implementation MUST follow. The implementations in this repository
(`ergo-agent-pay` TypeScript, `ergo-agent-py` Python, `ergo-agent-mcp` MCP
server) are normative reference clients for v0.

The four protocol primitives — **Reserve**, **Note**, **Tracker**, and the
**Acceptance Predicate** — are implemented as Ergo eUTxO boxes whose contents
are specified below. v0 is intended for testnet development. v1 will tighten
the predicate format, freeze register layouts, and require audited ergoTrees.

---

## 1. Hashing

All cryptographic hashing in this protocol is **BLAKE2b-256** — i.e., the
BLAKE2b family parameterised to a 32-byte output, the same primitive bound to
ErgoScript's `blake2b256(...)` builtin.

* `digest_size` = 32 bytes
* output is encoded as a 64-character lowercase hex string
* no salt, no key, no personalization
* input is the raw byte string to be hashed (no length prefix, no framing)

A non-conforming hash function (notably SHA-256, which earlier drafts of this
SDK used) will produce a digest that the on-chain `blake2b256(...)` predicate
will never accept. SDKs MUST NOT silently fall back to SHA-256.

### Golden vectors

Cross-language parity is enforced by
[`test-vectors/task-hash.json`](test-vectors/task-hash.json), which the
TypeScript and Python test suites both load. The vectors include the empty
string, ASCII, JSON payloads, UTF-8 with multi-byte code points, and raw
binary inputs. A new SDK MUST reproduce every listed digest before claiming
v0 conformance.

---

## 2. Reserve v0

A Reserve is a collateral box that backs one or more Notes. The total face
value of unredeemed Notes drawn against a Reserve MUST NOT exceed the
Reserve's value.

| Field | Value |
|---|---|
| `value` | the collateral, in nanoERG |
| `ergoTree` | compiled ChainCash / Basis Reserve script (production) or P2PK at the deployer address (dev mode) |
| `R4` *(optional)* | UTF-8 memo, sigma-encoded as `Coll[Byte]` |

In production the Reserve's `ergoTree` is the script that enforces redemption
rules (collateralisation, issuer signature, emergency exit). In dev mode the
script is omitted and the box is a plain P2PK; the Reserve's invariants are
checked off-chain only.

SDKs MUST refuse to broadcast a dev-mode Reserve on mainnet unless the caller
has explicitly opted in via `allowInsecureDevMode` (see §6).

---

## 3. Note v0

A Note is a programmable bearer IOU drawn against a Reserve. The face value
sits in the box's `value` field; the contract context lives in the additional
registers.

| Register | Type | Meaning |
|---|---|---|
| `R4` | `Coll[Byte]` | reserve box id (32 bytes) |
| `R5` | `Int` | expiry block height — Note is unredeemable when `HEIGHT >= R5` |
| `R6` *(optional)* | `Coll[Byte]` | task hash — BLAKE2b-256 of the expected task output |
| `R7` *(optional)* | `Coll[Byte]` *or* `GroupElement` | credential key for credential-gated predicates |

If the Note carries an acceptance predicate (R6 set), the spending
transaction MUST inject the corresponding task output bytes as **context
variable 0**. The on-chain predicate computes `blake2b256(getVar[Coll[Byte]](0).get)`
and checks equality against R6.

The encoding written into context variable 0 is the standard sigma `Coll[Byte]`
form: `0x0e` type tag, length varint, raw bytes. v0 keeps task outputs short
(< 256 bytes) and uses a single-byte length prefix; longer outputs require a
proper varint and are reserved for v1.

If R6 is unset, the predicate is satisfied trivially and the Note acts as a
plain expiring bearer payment.

---

## 4. Tracker v0

A Tracker is the on-chain anti-double-spend registry for Notes drawn against
a particular Reserve. Every Note redemption MUST consume the current Tracker
box and produce a successor whose spent-set contains the redeemed Note's
boxId.

| Field | Value |
|---|---|
| `value` | minimum box value (`SAFE_MIN_BOX_VALUE`, ~0.001 ERG) |
| `ergoTree` | compiled Tracker script — REQUIRED. v0 has no dev fallback for Trackers because a P2PK "tracker" provides no double-spend resistance. |
| `R4` | `Coll[Byte]` — the spent set, encoded as a serialised list of 32-byte boxIds. v0 uses a flat concatenation; v1 will switch to a Merkle-root commitment to support large sets without per-redemption growth. |

A Tracker MUST be unique per Reserve. Federations of Trackers — multiple
trackers committing to a shared root — are an out-of-scope extension.

---

## 5. Acceptance Predicate v0

The reference predicate is `TASK_HASH_PREDICATE_SCRIPT` from
[`predicates.ts`](packages/ergo-agent-pay/src/predicates.ts):

```
{
  val expiry       = R5[Int].get
  val expectedHash = R6[Coll[Byte]].get
  val taskOutput   = getVar[Coll[Byte]](0).get
  val actualHash   = blake2b256(taskOutput)
  sigmaProp(HEIGHT < expiry && actualHash == expectedHash)
}
```

A credential-gated variant additionally checks `proveDlog(R7)` — see
`CREDENTIAL_PREDICATE_SCRIPT`.

v0 fixes the hash function (BLAKE2b-256), the register layout, and the
context-variable index (0). v1 will add:

* a multi-output predicate (commit to several outputs by hashing their
  serialisation)
* an oracle predicate (require the spend to reference an oracle box whose R4
  matches a stored value)
* a delegation predicate (allow a delegate to redeem after a delay)

These are explicitly out of scope for v0.

---

## 6. Production Safety

The lifecycle builders in `ergo-agent-pay` accept an optional
`scriptErgoTree`. Without one, the resulting box is a plain P2PK. On mainnet
that means any predicate stored in R5/R6/R7 is advisory only — the box can
be spent by the address holder without revealing a valid task output, which
breaks the security model.

The high-level `ErgoAgentPay` class enforces this with a guardrail:

* **testnet** — always allowed (dev convenience).
* **mainnet** + `scriptErgoTree` set — allowed (real on-chain enforcement).
* **mainnet** + no `scriptErgoTree` + `allowInsecureDevMode: true` — allowed
  (caller has explicitly accepted P2PK semantics).
* **mainnet** + no `scriptErgoTree` + no opt-in — rejected with
  `INSECURE_MAINNET_MODE`.

The same rule applies to `createReserve`, `issueNote`, and `deployTracker`.
Implementations of v0 in other languages MUST reproduce this rule.

---

## 7. Conformance

A v0-conformant SDK MUST:

1. Hash every task output with BLAKE2b-256 and reproduce every digest in
   `test-vectors/task-hash.json`.
2. Encode Note registers in the layout described in §3.
3. Inject task outputs into the spending transaction as context variable 0,
   in the sigma `Coll[Byte]` form (`0e <len> <bytes>`).
4. Refuse to broadcast Reserves, Notes, and Trackers on mainnet without a
   compiled `scriptErgoTree`, unless the caller has explicitly opted into
   dev mode.
5. Treat empty-string `scriptErgoTree` as missing (defence in depth against
   accidental empties from config files).

A non-conforming SDK MUST NOT advertise itself as `ergo-agent-pay v0`.

---

## 8. Versioning

This document specifies **v0**. Breaking changes require a `v0 → v1` bump
with a migration note in `CHANGELOG.md`. Additive changes (new optional
registers, new predicate templates) MAY ship in v0.x point releases.

The `version` field in `test-vectors/task-hash.json` tracks the spec
version the vectors apply to.
