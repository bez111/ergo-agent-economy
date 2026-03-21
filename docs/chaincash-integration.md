# ChainCash Integration Guide

[ChainCash](https://github.com/ChainCashLabs/chaincash) is the production implementation
of the Reserve + Note + Tracker stack — live on Ergo mainnet.

This guide shows how to use `ergo-agent-pay` with real ChainCash contracts.

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
val ctx = RestApiErgoClient.create(nodeUrl, NetworkType.MAINNET, "", explorerUrl)
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

Once you have compiled `ergoTree` hex from ChainCash:

```typescript
import { ErgoAgentPay } from "ergo-agent-pay"

const agent = new ErgoAgentPay({ address, network: "mainnet", signer })

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

> Live data — verify on https://explorer.ergoplatform.com

The ChainCash protocol maintains a canonical Tracker box on mainnet.
Query the explorer for the latest Tracker box ID before issuing Notes.

```typescript
// Find current ChainCash tracker on mainnet
const trackerBoxes = await fetch(
  "https://api.ergoplatform.com/api/v1/boxes/unspent/byErgoTree/" + CHAINCASH_TRACKER_ERGOTREE
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
