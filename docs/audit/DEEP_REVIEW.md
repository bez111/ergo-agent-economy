# Deep Review — `ergo-agent-economy` mainnet readiness

**Status:** technical second-opinion review. **NOT a certification.** This
document complements [`PRE_AUDIT_FINDINGS.md`](PRE_AUDIT_FINDINGS.md) with
deeper line-by-line findings against the contracts in
`packages/ergo-agent-scripts/data/sources/`, the inline acceptance
predicates in `packages/ergo-agent-scripts/data/predicates.json`, and the
SDK-side audit/safety glue. Source of truth is `commit d0cd95...` on
`main`.

A production mainnet release still requires an external auditor with
ErgoScript / sigma-state experience to sign
[`AUDITED_ERGOTREES.json`](../../packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json).
The findings here are inputs for that auditor and pre-conditions the
project should resolve (or explicitly accept with documented rationale)
before mainnet.

---

## Methodology

* Read every contract source in
  `packages/ergo-agent-scripts/data/sources/` and the two inline
  predicates from `packages/ergo-agent-scripts/data/predicates.json`.
* Read SDK glue: `safety.ts`, `encoding.ts`, `audited.ts`,
  `lifecycle.ts`, `transactions.ts`.
* Trace every script's:
  * register reads / writes, `.get` failure points
  * action dispatch and the meaning of the byte-encoded
    `action` / `index` pair
  * `selfPreserved`-style invariants (what they cover and what they miss)
  * Schnorr verification (a, z), Fiat-Shamir construction
  * AVL tree state transitions (insert / update / insertOrUpdate)
  * arithmetic overflow / underflow / division-by-zero
  * cross-contract assumptions (data inputs, INPUT / OUTPUT positions,
    template substitution)
* Cross-check SDK behaviour against the on-chain semantics it relies on.
* No interpreter-level execution was performed. Findings flagged as
  "must be confirmed by interpreter test" require sigma-state / sigma-rust
  to settle.

---

## Findings table

| ID | Severity | Area | Summary |
|---|---|---|---|
| **C-001** | Critical | task_hash_v0 | Mempool front-running once `taskOutput` is revealed; **confirms A-003** |
| **C-002** | Critical | chaincash_reserve_v0 | R5 (note-token tree) not preserved in top-up / mint actions |
| **C-003** | Critical | basis_reserve_v0 | `insert` instead of `insertOrUpdate` makes any second redemption impossible |
| **H-001** | High | chaincash_reserve_v0 | Hardcoded mainnet oracle + buyback NFT IDs make the contract unusable on testnet |
| **H-002** | High | chaincash_reserve_v0 | Mint-note action does not check that an output is a Note — minting is unverified |
| **H-003** | High | chaincash_note_v0 | Spending requires `holder == reserveDataInput.R4`, breaking bearer transferability without a per-holder reserve |
| **H-004** | High | chaincash_reserve_v0 | Buyback fee bypassed when redeemed == 0 (receipt re-redemption with no value moved) |
| **M-001** | Medium | chaincash_receipt_v0 | Receipt R7 is set to reserve owner key but commented as "redeemer PK" — contradiction must be resolved |
| **M-002** | Medium | chaincash_receipt_v0 | Re-redemption resets the 3-year burn timer — receipts can be perpetually rolled forward |
| **M-003** | Medium | basis_reserve_v0 | Tracker can DoS emergency redemption by updating its box frequently with same digest |
| **M-004** | Medium | SDK / safety | Throwing `auditPolicy` leaks raw error instead of typed `UNAUDITED_ERGOTREE` |
| **M-005** | Medium | SDK / scripts | Registry's `ergoTreeHex` not cross-checked against the audited manifest at load time |
| **M-006** | Medium | SDK | `dangerouslyAllowUnauditedErgoTree` is config-only; no per-call override for narrow integrations |
| **M-007** | Medium | basis_reserve_v0 | Empty `trackerSigBytes` (size==0) is the trigger for emergency-only mode — easy to set accidentally |
| **L-001** | Low | SDK / encoding | `encodeSigmaCollByte` accepts length=0; empty payload hashes to a publicly-known constant |
| **L-002** | Low | chaincash_note_v0 | Redemption uses `INPUTS(-action)` where `-action` can be 1..128; bounds not pre-checked |
| **L-003** | Low | SDK / lifecycle | `decodeRegisterInt` uses JS `parseInt` and breaks for values > 2^53 |
| **L-004** | Low | chaincash_receipt_v0 | `noTokensInOutputs` enforces all-outputs-tokenless on burn, even fee outputs |
| **I-001** | Info | chaincash_note_v0 | `properReserve = holder == reserve.R4` is a design choice that needs auditor confirmation |
| **I-002** | Info | SPEC.md | "If R6 is unset, predicate is satisfied trivially" contradicts task_hash_v0's `R6.get`; **A-008** |
| **I-003** | Info | basis_reserve_v0 | Schnorr signature byte split is positional; rejects malformed inputs gracefully |

---

## Detailed findings

### C-001 — task_hash_v0 mempool front-running (confirms A-003)

**Source:** `predicates.json:inline:task_hash_v0`

```ergoscript
val expiry       = SELF.R5[Int].get
val expectedHash = SELF.R6[Coll[Byte]].get
val taskOutput   = getVar[Coll[Byte]](0).get
val actualHash   = blake2b256(taskOutput)
sigmaProp(HEIGHT < expiry && actualHash == expectedHash)
```

The script has no binding to a receiver pubkey, no `proveDlog`, and no
constraint on the redemption output. Once a valid `taskOutput` lands in
the mempool inside a redemption transaction's context extension, any
observing node can:

1. Read the transaction (mempool is public).
2. Extract context variable 0.
3. Build a competing redemption transaction that pays a different output
   address but presents the same `taskOutput`.
4. Front-run the original by paying a higher fee.

Result: the legitimate redeemer loses the redemption.

**Fix:** treat `task_hash_v0` as bearer-only / demo. Use `credential_v0`
on mainnet (already `mainnetAllowed: false` in the manifest, but the
SDK should make this the default for any predicate-bound Note path).

A future `bound_receiver_v0` should:
* take `SELF.R7 = receiver pubkey`
* add `proveDlog(SELF.R7)` to the predicate
* and/or check that `OUTPUTS(0).propositionBytes == receiverScript`

The audit manifest already marks this entry as not allowed on mainnet.
Promote that into a runtime block on the SDK side with a clearer error.

---

### C-002 — ChainCash Reserve R5 not preserved in top-up / mint paths

**Source:** `data/sources/reserve.es:21-25, 124-131`

```ergoscript
val selfPreserved =
        selfOut.propositionBytes == SELF.propositionBytes &&
        selfOut.tokens == SELF.tokens &&
        selfOut.R4[GroupElement].get == SELF.R4[GroupElement].get
```

`selfPreserved` does **not** include R5 (the AVL tree of all note tokens
issued). The redemption path (action 0) implicitly constrains R5 through
its proofs, but actions 1 (top up) and 2 (mint note) only check
`selfPreserved`:

```ergoscript
} else if (action == 1) {
  // top up
  // todo: check R5 preservation
  sigmaProp(selfPreserved && (selfOut.value - SELF.value >= 1000000000))
} else if (action == 2) {
  // issue a note
  // todo: check R5 preservation
  sigmaProp(selfPreserved)
}
```

Both branches carry an explicit `// todo: check R5 preservation` from
the upstream ChainCash author. **Top-up** can mutate R5 to any AVL tree
the spender chooses. **Mint-note** can do the same.

**Attack scenario.** A reserve owner whose AVL tree records "5 notes
issued, total face value X" performs a top-up, secretly replacing R5
with an empty tree. The next redemption against this reserve cannot
prove that the note's history-tree key exists in R5 → the proof check
fails and the redeemer is silently denied.

**Fix:** add `selfOut.R5[AvlTree].get == SELF.R5[AvlTree].get` (or the
intended state-transition rule) to actions 1 and 2.

---

### C-003 — Basis Reserve cannot do second redemption (`insert` not `insertOrUpdate`)

**Source:** `data/sources/basis.es` — line marked `// todo: insertOrUpdate after appkit update`

```ergoscript
val nextTree: AvlTree = SELF.R5[AvlTree].get.insert(Coll(redeemedKeyVal), insertProof).get
```

`AvlTree.insert(...)` returns `None` when any of the listed keys is
already present in the tree. The `.get` then throws.

For **first redemption** of `(owner, receiver)`:
* `lookupProofOpt = getVar[Coll[Byte]](7)` is `None`
* defaults `(storedTimestamp, redeemedDebt) = (0L, 0L)`
* `insert(key, value)` succeeds → key now exists.

For **second redemption** of the same pair:
* `lookupProofOpt = Some(proof)` (must be set, because key exists)
* reads existing `(storedTimestamp, redeemedDebt)`
* attempts `insert(key, newValue)` → fails because key already exists
* contract fails.

The contract-level intent — partial redemption with cumulative
`redeemedDebt` updates — is not implementable with the current AVL call.
Repeated payments to the same `(owner, receiver)` cannot be redeemed.
The TODO is real and breaks the documented behaviour.

**Fix:** switch to `insertOrUpdate` once it lands in the AppKit-bound
ErgoScript surface, or hand-roll via `update` after first redemption
(branch on `lookupProofOpt.isDefined`). Add a positive test for second
partial redemption.

---

### H-001 — Hardcoded mainnet NFT IDs in `chaincash_reserve_v0`

**Source:** `data/sources/reserve.es:50, 62`

```ergoscript
val properOracle = goldOracle.tokens(0)._1 ==
  fromBase16("3c45f29a5165b030fdb5eaf5d81f8108f9d8f507b31487dd51f4ae08fe07cf4a")
// ...
val buyBackNFTId =
  fromBase16("bf24ed4af7eb5a7839c43aa6b240697d81b196120c837e1a941832c266d3755c")
```

Both are mainnet token IDs. On testnet there is no oracle box with that
NFT and no buyback box with that NFT, so:

* Action 0 (redemption) cannot produce a valid TX on testnet.
* Top-up and mint-note paths still work (no oracle dependency).

**Implication for this repo.** `ergo-agent-pay`'s SDK presents testnet
as the safe default for development. With this contract, ChainCash flows
on testnet are silently broken — the SDK cannot run a full redemption
end-to-end test on testnet without first deploying mock oracle and
buyback boxes with these exact NFT IDs (impossible, IDs are commitments).

**Fix options:**
1. Templatise the NFT IDs (`$goldOracleNftId`, `$buybackNftId`) and
   parameterise per-network. Requires manifest support for per-network
   compiled trees.
2. Ship a `chaincash_reserve_testnet_v0` with testnet-specific IDs and
   mark `chaincash_reserve_v0` as `mainnetOnly: true` in the manifest.
3. Keep current behaviour and document that ChainCash redemption is
   mainnet-only in `SECURITY.md`.

Whatever the choice, the manifest should distinguish mainnet-only trees
from testable trees so the SDK can refuse to test the wrong combination.

---

### H-002 — Mint-note action does not verify any note is created

**Source:** `data/sources/reserve.es:128-131`

```ergoscript
} else if (action == 2) {
  // issue a note
  // todo: check R5 preservation
  sigmaProp(selfPreserved)
}
```

Action 2 is documented as "issue a note" but the contract only checks
that the reserve box itself is preserved. Nothing prevents a spender
from invoking action 2 and producing zero new note boxes. Combined with
C-002 (R5 not preserved), the action is effectively a no-op.

This is not a money-loss bug — the spender cannot drain the reserve via
this path because `selfPreserved` keeps `selfOut.tokens == SELF.tokens`
and `selfOut.value` is unrestricted (top-up only checks the increase
direction). But it is a contract correctness issue: anyone can spend the
reserve through action 2, mutate R5 freely, and produce no observable
state change for note holders.

**Fix:** action 2 should verify that exactly one new note box appears
in `OUTPUTS`, with the correct script (`note.es` ergoTree hash), the
right tokens, and that R5's tree includes the new note's key.

---

### H-003 — ChainCash Note spending requires `holder == reserve.R4`

**Source:** `data/sources/note.es:42, 70`

```ergoscript
val reserve = CONTEXT.dataInputs(0)
// ...
val properReserve = holder == reserve.R4[GroupElement].get
```

The current note holder (R5) must equal the reserve data input's owner
key (R4). For a note to circulate from Alice to Bob:

1. Alice mints a note against Reserve_A (R5 = Alice).
2. Alice transfers to Bob via the spending path. The TX builds
   newNote (R5 = Bob). For the spending TX to be valid, the data input
   reserve must satisfy `Alice == reserve.R4`. So the spending TX
   references Reserve_A.
3. Bob now wants to spend the note (transfer to Carol). The data input
   reserve must satisfy `Bob == reserve.R4` — meaning **Bob must have
   his own Reserve box on chain**.

In other words, every holder along the chain must register a Reserve
before holding notes, or the note is unspendable for them. This is
unusual for a bearer-instrument design.

This may be intentional (it ensures every transferor has a known
on-chain reserve to redeem against), but it changes the UX
significantly: notes are not freely circulating bearer instruments;
they are bilateral IOUs with a registered chain of holders.

**Action:** auditor must clarify whether this is the intended ChainCash
semantic. If yes, document it loudly. If no, the contract is broken for
multi-hop transfer.

---

### H-004 — Buyback fee bypassed when `redeemed == 0`

**Source:** `data/sources/reserve.es:58-71`

```ergoscript
val buyBackCorrect = if (redeemed > 0) {
  // ... 0.2% fee enforcement ...
} else {
  true
}
```

`redeemed = SELF.value - selfOut.value`. When the spending TX leaves the
reserve's value unchanged, `redeemed = 0`, and the buyback fee check is
skipped entirely.

This path is reachable in two ways:

1. **Receipt re-redemption** with `receiptMode == true` and
   `position < noteInput.R5[Long]` such that the script can be satisfied
   without moving any ERG. The redeemer can construct an apparently-valid
   redemption that doesn't actually pay anything — no fee for the
   buyback, no value for the redeemer. Useful for stamping a receipt
   without a fee.
2. **Action 0 abuse** by an honest-looking redeemer who spends the
   reserve through action 0 with `selfOut.value == SELF.value` and a
   crafted note input whose value is 0 (which the AVL signature can
   sign as long as `noteValue <= maxValue` and `maxValue` is set large
   enough).

The buyback fee is the protocol's revenue source for the gold oracle
network. Skipping it on every zero-value redemption gives an attacker a
free state-mutation primitive on the reserve.

**Fix:** require `buyBackCorrect` checks to apply uniformly, or require
`redeemed >= someEpsilon` whenever action 0 is taken.

---

### M-001 — Receipt R7 contradiction (sets to ownerKey, comments say "redeemer PK")

**Sources:**
* `data/sources/receipt.es:11` — comment: `R7 - redeemer PK`
* `data/sources/reserve.es:114` — code:
  `receiptOut.R7[GroupElement].get == ownerKey`

The receipt source documents R7 as the redeemer's public key. The
reserve source enforces, at receipt creation time, that R7 equals the
reserve **owner's** key (`ownerKey = SELF.R4[GroupElement].get`).

These can match only if the redeemer is the reserve owner — which is
the refund pattern, not the bearer-redemption pattern. Under
bearer-redemption (Bob holds Alice's note, redeems it against Alice's
reserve), R7 ends up as Alice's key, not Bob's. Then `reRedemption` in
receipt.es evaluates `proveDlog(SELF.R7[GroupElement].get) =
proveDlog(Alice)` — Alice can re-redeem the receipt, not Bob.

Under that reading, every redemption hands the re-redemption right to
the reserve owner, not the note holder. Bob loses the value he was
supposed to claim if Alice's first reserve was undercollateralized.

**Action:** auditor must reconcile the comment and the code. If the
intent is "redeemer PK", `reserve.es` is wrong and must set
`receiptOut.R7` from a context variable supplied by the redeemer. If
the intent is "owner refund", the receipt source comment is misleading
and the bearer-redemption flow is silently broken.

---

### M-002 — Receipt re-redemption resets the 3-year burn timer

**Source:** `data/sources/reserve.es:108-114`, `data/sources/receipt.es:14-18`

`receipt.es` accepts spending after `HEIGHT > creationHeight + 788400`
(3 years). On creation, `reserve.es` checks:

```ergoscript
receiptOut.R6[Int].get >= HEIGHT - 20 &&
receiptOut.R6[Int].get <= HEIGHT
```

So R6 is bounded to the current height. **But during re-redemption**,
the new receipt produced by `receiptMode == true` is also subject to
the same constraint, with HEIGHT now being the re-redemption block.
Net effect: every re-redemption against another reserve refreshes R6 to
the current height and the burn timer resets to 3 years.

A holder who keeps re-redeeming against new reserves never burns their
receipt, escaping storage rent indefinitely. Whether this is a bug
depends on the storage-rent design intent. Worth flagging.

---

### M-003 — Basis emergency-redemption denial via tracker spam

**Source:** `data/sources/basis.es:248-256`

```ergoscript
val trackerUpdateTime = tracker.creationInfo._1
val enoughTimeSpent = (HEIGHT - trackerUpdateTime) > 3 * 720 // 3 days passed
```

`creationInfo._1` is the creation height of the tracker box. Each time
the tracker spends and re-creates its own box (which is the normal
flow for periodic state commits), `creationInfo._1` is updated to the
new block.

A malicious or coerced tracker can update its box every < 3 days
without changing its AVL digest. Honest creditors waiting for the
3-day emergency window never see it open. The tracker has effectively
indefinite veto power on emergency exit.

**Fix:** anchor the emergency window to a different signal — for
instance, an explicit `lastSignedAt` timestamp the tracker must update
in R6 or another register, with a contract clause that opens emergency
based on `HEIGHT - lastSignedAt > N` instead of `HEIGHT - creationHeight`.

---

### M-004 — Buggy `auditPolicy` callback leaks raw error

**Source:** `packages/ergo-agent-pay/src/safety.ts`

```ts
if (args.auditPolicy) {
  const verdict = await args.auditPolicy(scriptErgoTree!, scriptName);
  if (verdict.ok) return;
  throw new ErgoAgentPayError(`...`, "UNAUDITED_ERGOTREE");
}
```

If `args.auditPolicy` itself throws (rather than returning
`{ ok: false }`), the exception propagates out of
`assertProductionSafety` unwrapped. The caller observes whatever the
policy raised, which may be an internal stack trace, a non-Error value,
or an `ErgoAgentPayError` with the wrong code.

**Fix:** wrap the call in try/catch and convert any thrown value to
`UNAUDITED_ERGOTREE` with the policy name and original message
preserved in the cause.

---

### M-005 — Registry vs manifest cross-check is one-way

**Source:** `packages/ergo-agent-scripts/src/audited.ts`

`verifyAuditedErgoTree(name, tree)` cross-checks:

* `hash(suppliedTree) == manifest.entry.treeHashBlake2b256`
* `hash(manifest.entry.ergoTreeHex) == manifest.entry.treeHashBlake2b256`

It does **not** check that `registry.entry.ergoTreeHex ==
manifest.entry.ergoTreeHex`. So a partial tampering scenario:

1. Attacker edits `predicates.json` to substitute a different
   `ergoTreeHex` for `credential_v0` (and computes a matching hash).
2. Manifest is unchanged.
3. Caller reads `tryGetErgoTree("credential_v0")` — returns attacker's
   tree.
4. Caller passes it to `agent.issueNote(...)`.
5. Audit policy calls `verifyAuditedErgoTree("credential_v0", attackerTree)` —
   FAILS because `attackerTree` does not hash to manifest's recorded
   hash.

So in this happy-path the audit policy catches it. **But** the SDK's
fall-through allows `dangerouslyAllowUnauditedErgoTree: true` and there
are integrators who will trust `tryGetErgoTree` without running it
through the audit policy. The two views can diverge.

**Fix:** add `verifyManifestAgainstRegistry()` invoked at module load
time. If `registry.entry.ergoTreeHex !== manifest.entry.ergoTreeHex`
for any entry, throw at import. Treat a divergence as a critical
configuration error, not a runtime check.

---

### M-006 — `dangerouslyAllowUnauditedErgoTree` is config-only

**Source:** `packages/ergo-agent-pay/src/types.ts`

The flag lives on `ErgoAgentPayConfig`. Once an agent is constructed
with the flag set, every mainnet write skips the audit gate. There is
no per-call override. An integration that wants to audit *most* trees
strictly but allow one experimental tree must construct a second agent
with the flag flipped — error-prone.

**Fix:** mirror the flag to `NoteOptions / ReserveConfig / TrackerConfig`
so a per-call override exists. Default to `false`, even when the agent's
config sets it to `true`, so per-call setting is the higher bar.

---

### M-007 — Empty `trackerSigBytes` is the emergency trigger

**Source:** `data/sources/basis.es:264-267`

```ergoscript
val trackerSigProvided = trackerSigBytes.size > 0
```

The contract uses `size > 0` to mean "tracker signature was supplied".
An honest user who happens to pass an empty `Coll[Byte]` accidentally
triggers emergency-only mode, and the contract evaluates `enoughTimeSpent`
instead of `properTrackerSignature`. If the emergency window is open,
redemption succeeds without any tracker signature — even though the user
intended to supply one.

This is a subtle SDK-level footgun. Any TS / Python helper that
constructs a redemption TX should refuse to set `trackerSigBytes` to an
empty value; raise an explicit "emergency mode requires omitting the
context var, not setting it to empty bytes".

**Fix:** in the SDK redemption builder, add a typed `useEmergencyMode:
true` flag that omits the context var entirely. Refuse empty-byte
inputs.

---

### L-001 — `encodeSigmaCollByte` accepts length=0

**Source:** `packages/ergo-agent-pay/src/encoding.ts`

`encodeSigmaCollByte(new Uint8Array())` returns `"0e00"` — an empty
Coll[Byte]. The corresponding `blake2b256("")` is publicly known
(`0e5751c0...`). A Note issued with R6 == that hash and an empty
`taskOutput` is accepted by `task_hash_v0`.

Not a vulnerability in itself, but a hint that the SDK should refuse
empty `taskOutput` for safety: such a Note is functionally equivalent
to "redeem any time before expiry, no proof of work required".

**Fix:** in `dangerouslyBuildRedeemNoteTx`, raise on empty `taskOutput`
when R6 is set to the empty-hash. Or simpler: reject `taskOutput.length
=== 0` outright in the encoder.

---

### L-002 — `INPUTS(-action)` bounds for negative action

**Source:** `data/sources/note.es:108-122`

```ergoscript
val index = -action
val reserveInput = INPUTS(index)
```

`action` is a Byte, so `-action` is `1..128`. `INPUTS(128)` is a likely
out-of-bounds access on real transactions. ErgoScript fails closed when
the index is invalid, so this is not exploitable, but the contract has
no upper bound on `index`.

**Fix:** explicit `index <= INPUTS.size - 1` check, or a stricter
allowed-action range with `action >= -10`.

---

### L-003 — `decodeRegisterInt` JS-number ceiling

**Source:** `packages/ergo-agent-pay/src/lifecycle.ts`

```ts
const zigzag = parseInt(valueHex, 16);
return (zigzag >>> 1) ^ -(zigzag & 1);
```

`parseInt` converts to a JS `number`. Values above 2^53 silently lose
precision; values that VLQ-encode to multi-byte representations require
a real varint decoder.

In practice the only register the SDK decodes as `Int` is `R5` (block
height), which fits fine for the next ~50,000 years. But the helper is
exported and could be used for other registers.

**Fix:** raise on inputs that would overflow JS number, or switch to
`bigint`.

---

### L-004 — `noTokensInOutputs` rejects fee outputs

**Source:** `data/sources/receipt.es:13`

```ergoscript
val noTokensInOutputs = OUTPUTS.forall(noTokens)
```

In the `burnDone` path, this requires every output (including the miner
fee output) to carry zero tokens. Miner fee outputs in Ergo are ERG-only
in normal mining, so this is fine in practice — but the contract does
not allow a single output to carry, say, a "burn certificate" token.
Inflexible but not a vulnerability.

---

### I-001 — `properReserve = holder == reserve.R4`: design clarification

See H-003. The reserve-owner-binding is the design choice that needs
documentation, not necessarily a bug.

---

### I-002 — `SPEC.md` is wrong about R6-less Notes (A-008)

**Source:** `SPEC.md §3`, `predicates.json:task_hash_v0`

> If R6 is unset, the predicate is satisfied trivially…

`task_hash_v0` calls `SELF.R6[Coll[Byte]].get` unconditionally. If R6
is missing the script throws and the Note is unspendable. The "trivially
satisfied" language describes a different design that is not implemented.

**Fix:** delete the sentence, or add an `expiry_v0` predicate that does
no R6 check. Same finding as audit pack A-008.

---

### I-003 — Schnorr (a, z) byte split is positional

The basis sources use `slice(0, 33)` and `slice(33, size)` to split the
64-byte (or larger) Schnorr signature. This works because:

* `decodePoint` rejects malformed compressed points → bad `aBytes` fails.
* `byteArrayToBigInt(empty)` would zero out `z`, which makes
  `g.exp(0) == identity`, and the `a * x^e == identity` would require
  `a = x^-e`. An attacker who can choose `a` could construct this; but
  the Fiat-Shamir hash is over `aBytes ++ message ++ pubkey`, so
  changing `a` changes `e`, breaking the relation.

So the positional split is safe under Fiat-Shamir. Worth recording in
the audit log so the auditor doesn't need to redo this analysis.

---

## Severity-prioritised TODO before mainnet

### Must-fix before any mainnet promotion

1. **C-002** — close R5 preservation in ChainCash reserve actions 1, 2.
2. **C-003** — replace `insert` with `insertOrUpdate` in basis_reserve_v0
   (both ERG and token variants). Add positive test for second redemption.
3. **H-002** — make ChainCash mint-note action verify a Note output exists
   with correct script and tokens.
4. **H-004** — make buyback fee mandatory (or guard on a more meaningful
   precondition than `redeemed > 0`).

### Should-fix before any mainnet promotion

5. **C-001** — keep `task_hash_v0` `mainnetAllowed: false` permanently
   (or replace with a receiver-bound v0). Already done at manifest level;
   lock it in by making the SDK never default to it.
6. **H-003** — auditor confirms `holder == reserve.R4` semantics or
   redesigns ChainCash note transfer.
7. **H-001** — separate testnet / mainnet ChainCash reserve trees, or
   templatise the NFT IDs.
8. **M-001** — auditor decides receipt R7 = reserve owner vs. redeemer.

### Should-fix before public mainnet release

9. **M-003** — replace `creationInfo._1` emergency-period anchor with
   tracker-supplied `lastSignedAt`.
10. **M-004**, **M-005**, **M-006**, **M-007** — SDK hardening.

### Nice-to-have

11. **L-001..L-004**, **I-002** — quality improvements; ship as time allows.

---

## Out of scope of this review

* Cryptographic verification of the @fleet-sdk/compiler output. The
  recompile-and-diff CI gate catches drift but does not prove the compiler
  is correct. An interpreter test with sigmastate-jvm or sigma-rust would
  close this gap.
* Audit of `chaincash_note_v0` AvlTree history-tree structure for
  collision resistance. Requires knowledge of the ChainCash tree schema
  beyond what is in this repo.
* Economic modelling of basis tracker incentives.
* Audit of the upstream ChainCash test suite. The ChainCash repo has
  Scala specs in `src/test/scala/chaincash/` that should be cross-read
  during the formal audit.

---

## What the SDK already does right

For the auditor's record, these properties are in place and verified by
test:

* Single normative hash (BLAKE2b-256) across TS, Python, MCP, with
  cross-language golden vectors.
* Two-gate mainnet safety: box-shape gate and audit-identity gate.
* `dangerously*` naming on bypass surfaces and raw builders.
* `encodeSigmaCollByte` enforces the v0 length cap.
* Manifest carries source hash AND post-template source hash AND tree
  hash, so the auditor has a fully traceable chain of bytes.
* Manifest `mainnetAllowed: false` defaults block every entry until an
  external auditor explicitly flips them.

Mainnet certification is now blocked by content (an auditor's signature
on the manifest), not by code.
