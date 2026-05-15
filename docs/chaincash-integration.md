# ChainCash Integration Guide

[ChainCash](https://github.com/ChainCashLabs/chaincash) is an external
implementation of the Reserve + Note + Tracker design space that informed the
Ergo reference rail.

This guide is a legacy integration note for `ergo-agent-pay`. It is not a
mainnet launch guide and does not override [`docs/status.md`](./status.md) or
[`SECURITY.md`](../SECURITY.md). In this repository, ChainCash/Basis scripts and
related Accord rail adapters remain reference / research / draft-pre-audit
material until signed audit manifests explicitly allow a mainnet artifact.

Use testnet or local development flows by default. Do not use real funds unless
the exact script hash you are using is externally audited, signed in the
relevant manifest, and marked `mainnetAllowed: true`.

---

## What ChainCash provides

| Component | ChainCash provides | ergo-agent-pay default |
|---|---|---|
| Reserve script | `reserveScript.es` — enforces collateral limits | P2PK (dev only) |
| Note script | `noteScript.es` — enforces bearer redemption | P2PK (dev only) |
| Tracker script | `trackerScript.es` — prevents double-spend | Required (no fallback) |
| Compiled ergoTree | Pre-compiled hex for each script | Must compile yourself |

---

## Compiling ChainCash scripts

You need the compiled `ergoTree` hex for each script. Two options:

### Option A — ergo-lib-wasm (browser/Node.js)

```bash
npm install ergo-lib-wasm-nodejs
```

```typescript
import { Address, ErgoTree } from "ergo-lib-wasm-nodejs"

// ChainCash Reserve script (simplified — use actual from ChainCash repo)
const RESERVE_SCRIPT = `{
  val reserveId    = SELF.id
  val issuedNotes  = OUTPUTS.filter(o => o.R4[Coll[Byte]].isDefined && o.R4[Coll[Byte]].get == reserveId)
  val totalIssued  = issuedNotes.fold(0L, (acc, o) => acc + o.value)
  sigmaProp(totalIssued <= SELF.value && PK("${issuerPubKey}"))
}`

// Compile using ergo-lib-wasm (requires ergo-devtools or Sigma compiler)
// const ergoTree = Address.from_ergo_tree(ErgoTree.from_base16_bytes(compiledHex))
```

### Option B — AppKit (JVM)

```kotlin
// In a Kotlin/Scala project:
val ctx = RestApiErgoClient.create(nodeUrl, NetworkType.TESTNET, "", explorerUrl)
ctx.execute { blockchainContext ->
  val contract = blockchainContext.compileContract(
    ConstantsBuilder.create().item("issuerKey", issuerGroupElement).build(),
    RESERVE_SCRIPT
  )
  val ergoTree = contract.getErgoTree()
  // save ergoTree.bytesHex() as your scriptErgoTree parameter
}
```

---

## Using compiled scripts with ergo-agent-pay

Once you have compiled `ergoTree` hex from ChainCash for a testnet or audited
environment:

```typescript
import { ErgoAgentPay } from "ergo-agent-pay"

const agent = new ErgoAgentPay({ address, network: "testnet", signer })

// Deploy Reserve with ChainCash script
const reserve = await agent.createReserve({
  collateral: "10 ERG",
  scriptErgoTree: "0008cd...", // compiled ChainCash reserve ergoTree hex
  memo: "agent-treasury-v1",
})

// Deploy Tracker with ChainCash script
const tracker = await agent.deployTracker({
  scriptErgoTree: "0008cd...", // compiled ChainCash tracker ergoTree hex
})

// Issue Note — recipient's address encodes the note spending conditions
const note = await agent.issueNote({
  recipient:    receiverAddress,
  value:        "0.005 ERG",
  reserveBoxId: reserve.reserve.boxId!,
  deadline:     "+200 blocks",
  taskHash:     computedHash,
})
```

---

## ChainCash scripts reference

All scripts are in the ChainCash repo at `contracts/`:
- `reserveScript.ergotree` — Reserve spending guard
- `noteScript.ergotree` — Note bearer instrument
- `trackerScript.ergotree` — Anti-double-spend registry

GitHub: https://github.com/ChainCashLabs/chaincash/tree/master/contracts

---

## Mainnet ChainCash box IDs

Mainnet references are intentionally omitted from this guide. Treat any
mainnet box id, tree, or tracker reference as out of scope for Accord until the
audit manifests in this repository contain signed evidence for that exact
artifact.

For testnet experiments, query the relevant testnet explorer or your own node
for the current Tracker box before issuing Notes.

```typescript
// Find current testnet tracker
const trackerBoxes = await fetch(
  TESTNET_EXPLORER_URL + "/api/v1/boxes/unspent/byErgoTree/" + CHAINCASH_TRACKER_ERGOTREE
).then(r => r.json())
const trackerBoxId = trackerBoxes.items[0].boxId
```

---

## Development vs Production

| | Development | Production |
|---|---|---|
| Reserve | P2PK (omit `scriptErgoTree`) | ChainCash `reserveScript.ergotree` |
| Note | P2PK | ChainCash `noteScript.ergotree` |
| Tracker | Not required | Required — use ChainCash tracker |
| On-chain enforcement | Off-chain only | Miners enforce all conditions |
| Double-spend prevention | Not enforced | Tracker enforces |

**Never use P2PK mode in production** — it provides no on-chain guarantees.
