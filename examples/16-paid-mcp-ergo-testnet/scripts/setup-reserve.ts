#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-time Reserve creation for example 16.
//
//   $ npm run setup:reserve
//
// Reads BUYER_ADDR + signer wiring from common/setup.ts (same place the
// demo loads them from), creates a Reserve on testnet that backs all
// subsequent Note issuance, prints the resulting box id so the operator
// can paste it into .env as ACCORD_DEMO_RESERVE_BOX_ID.
//
// You only run this once per buyer wallet. After that, every demo run
// re-uses the Reserve until it's drained.
// ─────────────────────────────────────────────────────────────────────────────

import { buildBuyerAgent, loadTestnetConfigFromEnv } from "../common/setup.js"

const TOTAL_RESERVE_VALUE = "0.1 ERG" // backs ~100 demo Notes at 0.001 ERG each

async function main() {
  // Reserve setup intentionally does NOT require ACCORD_DEMO_RESERVE_BOX_ID
  // to be present yet — that's what we're producing.
  const cfg = loadTestnetConfigFromEnv({ requireReserveBoxId: false })

  const agent = buildBuyerAgent(cfg)

  console.log("Creating Reserve on testnet…")
  console.log(`  funder address    ${cfg.buyerAddress}`)
  console.log(`  total backing     ${TOTAL_RESERVE_VALUE}`)
  console.log("")

  const result = await agent.createReserve({
    // collateral caps total Note issuance against this Reserve. The demo
    // Note is 0.001 ERG, so 0.1 ERG backs ~100 demo runs.
    collateral: TOTAL_RESERVE_VALUE,
  })

  if (!result.submitted || !result.txId) {
    console.error(`✗ Reserve tx not submitted. submitted=${result.submitted}`)
    process.exit(1)
  }

  console.log(`✓ Reserve tx submitted   ${result.txId}`)
  console.log(`     explorer            https://testnet.ergoplatform.com/transactions/${result.txId}`)
  console.log("")
  console.log("Wait ~2 min for confirmation, then look up the Reserve box id:")
  console.log(`     curl https://api-testnet.ergoplatform.com/api/v1/transactions/${result.txId}`)
  console.log("")
  console.log("Paste the first output's boxId into your .env as:")
  console.log("     ACCORD_DEMO_RESERVE_BOX_ID=<box id>")
  console.log("")
}

await main()
