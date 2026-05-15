import { strict as assert } from "node:assert"
import { test } from "node:test"
import { parseEnvText, requiredTestnetEnvNames } from "../common/env.js"

test("parseEnvText reads simple .env assignments without leaking comments", () => {
  assert.deepEqual(
    parseEnvText(`
# ignored
export ACCORD_DEMO_BUYER_ADDR=buyer-address
ACCORD_DEMO_SELLER_ADDR="seller-address"
ACCORD_DEMO_RESERVE_BOX_ID=abc123 # local note
`),
    {
      ACCORD_DEMO_BUYER_ADDR: "buyer-address",
      ACCORD_DEMO_SELLER_ADDR: "seller-address",
      ACCORD_DEMO_RESERVE_BOX_ID: "abc123",
    },
  )
})

test("requiredTestnetEnvNames can skip reserve box id during reserve setup", () => {
  assert.deepEqual(requiredTestnetEnvNames({ requireReserveBoxId: false }), [
    "ACCORD_DEMO_BUYER_ADDR",
    "ACCORD_DEMO_SELLER_ADDR",
  ])
})
