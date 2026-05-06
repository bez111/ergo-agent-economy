# ergo-agent-scripts

Canonical ErgoScript sources for the v0 acceptance predicates plus a typed
registry slot for the compiled ergoTrees. Ships sources only; the compiled
trees are populated by running `npm run compile-predicates` against
`ergo-lib-wasm-nodejs` (a peer dependency that this package deliberately
does NOT bundle).

This is the package that turns the SDK from "verify-only on testnet" into
"production-safe on mainnet" — once the registry is populated and an
auditor has signed off on the trees, the SDK can pass them as
`scriptErgoTree` to `createReserve`, `issueNote`, and `deployTracker`.

## What ships in the package

- The ErgoScript **sources** for both v0 predicates, committed verbatim.
- The compiled **ergoTreeHex** for each predicate, produced by
  `@fleet-sdk/compiler`.
- A BLAKE2b-256 **hash** of every tree's raw bytes, stored alongside —
  re-runnable without the compiler via `npm run verify-predicates`,
  which catches a hand-edited registry.

The compiler is a peer dependency, optional. Inspecting sources, looking
up trees, hashing, and verifying does not require it.

## Install

```bash
npm install ergo-agent-scripts
```

## Re-compiling the trees

```bash
npm install --no-save @fleet-sdk/compiler
npm run compile-predicates                   # writes data/predicates.json
npm run verify-predicates                    # sanity-check the registry
```

Compilation is deterministic — running the script against the same source
with the same compiler version produces byte-identical output. CI runs
this check on every push.

The compile script:

1. Reads `data/predicates.json`.
2. For every entry, calls the WASM compiler on the `source`.
3. Records `ergoTreeHex` and `treeHashBlake2b256 = blake2b256(ergoTree bytes)`.
4. Stamps `compiledAt` (ISO-8601) and `compiler` (lib name + version).
5. Writes the file back.

Commit the result. The package consumes `data/predicates.json` directly,
so re-publishing rolls the new trees out to all callers.

## API

```ts
import { getPredicate, tryGetErgoTree, verifyErgoTree, hashErgoTree } from "ergo-agent-scripts";

// 1. Look up the source + register layout.
const p = getPredicate("task_hash_v0");
console.log(p.source);
console.log(p.registers);     // { R5: "...", R6: "..." }

// 2. Get the compiled tree.
const tree = tryGetErgoTree("task_hash_v0");
// tree is "191500d1ed8fa3e4c6a7050493cbe4e3000ee4c6a7060e" — pass to the SDK:
await agent.issueNote({ ..., scriptErgoTree: tree });

// 3. Verify a tree someone else handed you.
const result = verifyErgoTree("task_hash_v0", suspiciousTree);
if (!result.ok) throw new Error(result.reason);

// 4. Compute a tree hash directly (utility).
const hash = hashErgoTree(suspiciousTree);
```

## Predicates shipped in v0

### Acceptance predicates (used by `ergo-agent-pay` directly)

| name | purpose | registers |
|---|---|---|
| `task_hash_v0` | Note redemption requires `HEIGHT < R5` and `blake2b256(getVar[0]) == R6`. | R5 expiry (Int), R6 task hash (Coll[Byte]) |
| `credential_v0` | As above, plus `proveDlog(R7)`. | R5, R6, R7 group element |

### ChainCash on-chain contracts (vendored from [kushti/ChainCash](https://github.com/kushti/ChainCash))

| name | purpose |
|---|---|
| `chaincash_reserve_v0` | Reserve guard: owner-keyed collateral box. Three actions — redeem (#0), top up (#1), mint note (#2). Oracle-pegged redemption, 2% fee + 0.2% buyback. |
| `chaincash_note_v0` | Bearer IOU with spend / redeem paths. Schnorr signature in R4 history tree. Redemption requires Reserve and Receipt boxes in the same TX. |
| `chaincash_receipt_v0` | Ephemeral box created by note redemption; allows re-redemption against earlier reserves; self-burns 3 years after creation. |

`chaincash_note_v0` and `chaincash_receipt_v0` reference the previous
contract by hash — the registry's `dependsOn` field makes the compiler
resolve the chain in topological order.

### Basis offchain-credit reserves (vendored from [kushti/ChainCash/contracts/offchain](https://github.com/kushti/ChainCash/tree/main/contracts/offchain))

| name | purpose |
|---|---|
| `basis_reserve_v0` | ERG-only Basis reserve. Owner key + AVL tree of `(owner, receiver) → (timestamp, redeemed)`. Owner sig + tracker sig (or 3-day emergency exit). |
| `basis_token_reserve_v0` | Token-collateralised variant of the same scheme. |

The sources are committed verbatim under `data/sources/*.es` and exported
via `getPredicate(name).source` so a downstream auditor can confirm that
the package shipped the source they reviewed.

## Verifying a registry without the compiler

```bash
npm run verify-predicates
```

Recomputes `blake2b256(ergoTreeHex bytes)` for every populated entry and
checks against the recorded `treeHashBlake2b256`. Reports any mismatch
or unfilled entry. Suitable for a CI pre-publish gate.

## Compatibility with the safety guardrail

When the SDK runs on mainnet without `allowInsecureDevMode`, it refuses
to issue Notes / create Reserves / deploy Trackers without a
`scriptErgoTree`. `tryGetErgoTree(name)` is the canonical way to obtain
that value. When the registry is unfilled `tryGetErgoTree` returns
`null`, the SDK refuses to write, and the host gets a clear error
instead of accidentally producing a P2PK box that masquerades as a
predicate-bound one.
