/**
 * Example 01 — Basic Agent Payment on Ergo Testnet
 *
 * Sends 0.001 ERG from your testnet address to a receiver.
 * This is the "hello world" of Ergo agent payments.
 *
 * Prerequisites:
 *   - Node.js 18+
 *   - A testnet address (Nautilus wallet → Settings → Testnet mode)
 *   - Testnet ERG from https://testnet.ergofaucet.org
 *
 * Run:
 *   npm install
 *   node index.js
 */

import { TransactionBuilder, OutputBuilder } from "@fleet-sdk/core";

// ── Config ────────────────────────────────────────────────────────────────────
const TESTNET_API = "https://api-testnet.ergoplatform.com";
const YOUR_ADDRESS = "YOUR_TESTNET_ADDRESS";      // ← paste your testnet address here
const RECEIVER    = "3WwbzW6u8hKWBcL1W7kNVMr25s2UHfSBnYtwSHvrRQt7DdPuoXrt";
const AMOUNT_NANOERG = "1000000"; // 0.001 ERG

// ── 1. Get current block height ───────────────────────────────────────────────
async function getHeight() {
  const res = await fetch(`${TESTNET_API}/api/v1/info`);
  const { fullHeight } = await res.json();
  return fullHeight;
}

// ── 2. Get unspent boxes for your address ─────────────────────────────────────
async function getInputs(address) {
  const res = await fetch(`${TESTNET_API}/api/v1/boxes/unspent/byAddress/${address}`);
  const { items } = await res.json();
  return items;
}

// ── 3. Build + output the unsigned transaction ────────────────────────────────
async function buildPayment() {
  const height = await getHeight();
  const inputs = await getInputs(YOUR_ADDRESS);

  if (!inputs?.length) {
    console.error("No UTxOs found. Fund your address at https://testnet.ergofaucet.org");
    return;
  }

  const unsignedTx = new TransactionBuilder(height)
    .from(inputs)
    .to(new OutputBuilder(AMOUNT_NANOERG, RECEIVER))
    .sendChangeTo(YOUR_ADDRESS)
    .payMinFee()
    .build()
    .toEIP12Object();

  console.log("Unsigned TX (EIP-12 format):");
  console.log(JSON.stringify(unsignedTx, null, 2));
  console.log("\nNext steps:");
  console.log("  1. Sign with Nautilus (testnet mode) or a server-side key");
  console.log("  2. POST signed TX to: POST " + TESTNET_API + "/api/v1/transactions");
  console.log("  3. View on explorer: https://testnet.ergoplatform.com");
}

buildPayment().catch(console.error);
