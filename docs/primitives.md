# Agent Payment Primitives — Technical Reference

## Overview

Ergo's agent payment stack consists of four composable UTxO primitives.
Together they implement a complete trust-minimized payment system for autonomous agents
without any application-layer trust assumptions.

```
┌─────────────┐     issues      ┌───────────┐    redeems    ┌─────────────┐
│   Reserve   │ ──────────────► │   Note    │ ────────────► │   Reserve   │
│ (collateral)│                 │  (bearer) │               │  (settles)  │
└─────────────┘                 └─────┬─────┘               └─────────────┘
                                      │                            ▲
                                      │ references                 │
                                      ▼                            │
                               ┌─────────────┐   marks spent      │
                               │   Tracker   │ ───────────────────►│
                               │ (anti-dupe) │
                               └─────────────┘
```

---

## Reserve

### What it is
A UTxO holding ERG as backing collateral for a Note issuance system.

### How it works
- Created by an authorized issuer
- Spending script enforces: total outstanding notes ≤ reserve value
- Notes issued against this Reserve reference its box ID
- Can be topped up (add ERG) or partially drawn (if notes allow)

### ErgoScript
```scala
{
  val issuedNotes = OUTPUTS.filter(_.R4[Coll[Byte]].isDefined).size
  val reserveValue = SELF.value
  sigmaProp(
    issuedNotes <= reserveValue / NOTE_DENOMINATION &&
    PK(issuerKey)
  )
}
```

### Agent economy role
The Reserve is the **source of truth** for the credit system.
It makes the credit auditable, on-chain, and trustless.
Multiple agents can hold Notes backed by the same Reserve
and independently verify its solvency without contacting the issuer.

---

## Note

### What it is
A programmable bearer instrument — the primary payment token between agents.

### How it works
- References a Reserve box by ID (R4)
- Contains expiry block height (R5)
- Optional: acceptance predicate (R6+)
- Can be transferred freely (it's a UTxO — ownership = spending key)
- Redeemed against the Reserve at settlement time

### ErgoScript (simple version)
```scala
{
  val expiry     = R5[Int].get
  val noteValue  = SELF.value
  val price      = 5000000L // 0.005 ERG
  sigmaProp(HEIGHT < expiry && noteValue >= price)
}
```

### Agent economy role
The Note is the **payment instrument**. Instead of agents calling the issuer
for every micropayment, they pass Notes directly to each other.
Settlement is batched — the final holder redeems against the Reserve.

---

## Tracker

### What it is
A mutable UTxO maintaining the set of spent Note IDs.

### How it works
- Initialized with an empty spent set
- Every Note redemption transaction must:
  1. Input the current Tracker
  2. Verify Note ID is not in the spent set
  3. Output new Tracker with Note ID added to spent set
- Prevents double-redemption of the same Note

### ErgoScript
```scala
{
  val noteId    = INPUTS(0).id
  val spentSet  = SELF.R4[Coll[Coll[Byte]]].get
  val newTracker = OUTPUTS.filter(_.propositionBytes == SELF.propositionBytes)(0)
  val newSpent  = newTracker.R4[Coll[Coll[Byte]]].get

  sigmaProp(
    !spentSet.exists(_ == noteId) &&
    newSpent == spentSet.append(Coll(noteId))
  )
}
```

### Agent economy role
The Tracker solves **double-spend** without a central authority.
It's the on-chain equivalent of a clearing house — but trustless,
composable with any Reserve/Note system, and publicly auditable.

---

## Acceptance Predicate

### What it is
An ErgoScript condition embedded in the receiver's spending script that encodes
the conditions under which a payment is considered valid.

### How it works
The paying agent (Agent A) creates a Note with a custom spending script.
The script can check:
- Task output hash (blake2b256 of computation result)
- Deadline (expiry block height)
- Agent credentials (sigma protocol proofs)
- Any combination of the above

When Agent B redeems the Note, they provide context variables (the task output, proofs, etc.).
Miners verify the conditions. No off-chain logic needed.

### ErgoScript examples

**Task hash verification:**
```scala
{
  val taskOutput = getVar[Coll[Byte]](0).get  // provided by redeemer at redemption
  val taskHash   = blake2b256(taskOutput)
  val expected   = R6[Coll[Byte]].get         // stored in Note when issued
  sigmaProp(
    HEIGHT < R5[Int].get &&                   // not expired
    taskHash == expected                      // task completed correctly
  )
}
```

**Deadline + credential:**
```scala
{
  sigmaProp(
    HEIGHT < R5[Int].get &&
    proveDlog(R6[GroupElement].get)           // holder proves they own a specific key
  )
}
```

**Multi-condition:**
```scala
{
  val expired    = HEIGHT >= R5[Int].get
  val correctHash = blake2b256(getVar[Coll[Byte]](0).get) == R6[Coll[Byte]].get
  sigmaProp(!expired && correctHash)
}
```

### Agent economy role
Acceptance predicates turn **payments into enforceable contracts**.
The payment instrument itself encodes the service agreement.
No escrow. No arbitration. No off-chain oracle. No central authority.
This is the primitive that makes trustless agent commerce possible.

---

## Composing the Primitives

A complete agent payment flow:

```
1. Service provider deploys Reserve (e.g., 100 ERG backing)

2. Orchestrator agent issues Notes to sub-agents:
   - Each Note: 0.01 ERG, expiry +500 blocks, acceptance = task hash

3. Sub-agents pay API services with Notes:
   - Pass Note to API service
   - API service script checks: is this Note backed by a known Reserve?
   - API service accepts Note, executes task, records task hash

4. API service redeems Note against Reserve:
   - Provides task output as context variable
   - Tracker verifies Note not already spent
   - Reserve pays out ERG
   - Tracker updates spent set

5. Orchestrator tops up Reserve for next batch
```

Total on-chain state: 3 UTxOs (Reserve, Tracker, one Note per outstanding payment).
No central server. No persistent connections. No KYC.
