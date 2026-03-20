/**
 * Example 01 — Basic Payment
 *
 * Send 0.001 ERG from your agent wallet to a receiver.
 * Without a signer configured, the unsigned TX is printed for external signing.
 *
 * Run: npx tsx examples/01-basic.ts
 */

import { ErgoAgentPay } from "../src/index.js";

const agent = new ErgoAgentPay({
  address: "YOUR_TESTNET_ADDRESS",  // ← paste your testnet address
  network: "testnet",
});

const result = await agent.pay(
  "3WwbzW6u8hKWBcL1W7kNVMr25s2UHfSBnYtwSHvrRQt7DdPuoXrt",
  "0.001 ERG",
  { memo: "agent payment #1" }
);

console.log("Balance:", await agent.getBalance());
console.log("Unsigned TX:", JSON.stringify(result.unsignedTx, null, 2));
console.log("Submitted:", result.submitted);
// → Sign with Nautilus (testnet mode) or ergo-lib, then POST to /api/v1/transactions
