/**
 * Example 03 — Policy Enforcement
 *
 * Demonstrates all policy hooks:
 * - maxSinglePayment: hard limit per payment
 * - maxSessionSpend: cumulative session limit
 * - requireApprovalAbove: human-in-the-loop gate
 * - beforePay / afterPay hooks
 *
 * Run: npx tsx examples/03-policy-enforcement.ts
 */

import { ErgoAgentPay, ErgoAgentPayError } from "../src/index.js";

const agent = new ErgoAgentPay({
  address: "YOUR_TESTNET_ADDRESS",
  network: "testnet",
  policy: {
    // Hard limit: single payment max 0.005 ERG
    maxSinglePayment: 5_000_000n,

    // Hard limit: total session spend max 0.02 ERG
    maxSessionSpend: 20_000_000n,

    // Require approval for payments above 0.003 ERG
    requireApprovalAbove: 3_000_000n,
    approvalFn: async (ctx) => {
      // In production: send Slack message, wait for webhook, etc.
      console.log(`[approval] Payment of ${ctx.value} nanoERG to ${ctx.to} requires approval.`);
      console.log(`[approval] Auto-approving in demo...`);
      return true; // replace with real approval logic
    },

    beforePay: async (ctx) => {
      console.log(`[before] Checking payment: ${ctx.value} nanoERG → ${ctx.to}`);
      console.log(`[before] Session spend so far: ${ctx.sessionSpend} nanoERG`);

      // Custom logic: block payments to a specific address
      if (ctx.to === "BLOCKED_ADDRESS") {
        console.log("[before] Blocked address — rejecting");
        return false;
      }

      return true;
    },

    afterPay: async (ctx, result) => {
      console.log(`[after]  Paid ${ctx.value} nanoERG → txId: ${result.txId ?? "(unsigned)"}`);
    },
  },
});

const RECEIVER = "3WwbzW6u8hKWBcL1W7kNVMr25s2UHfSBnYtwSHvrRQt7DdPuoXrt";

// Payment 1: small, no approval needed
console.log("\n--- Payment 1: 0.001 ERG (no approval needed) ---");
try {
  await agent.pay(RECEIVER, "0.001 ERG");
} catch (err) {
  console.log("Rejected:", (err as Error).message);
}

// Payment 2: above approval threshold
console.log("\n--- Payment 2: 0.004 ERG (requires approval) ---");
try {
  await agent.pay(RECEIVER, "0.004 ERG");
} catch (err) {
  console.log("Rejected:", (err as Error).message);
}

// Payment 3: above hard limit → rejected immediately
console.log("\n--- Payment 3: 0.01 ERG (above hard limit) ---");
try {
  await agent.pay(RECEIVER, "0.01 ERG");
} catch (err) {
  if (err instanceof ErgoAgentPayError) {
    console.log(`Policy rejected (${err.code}):`, err.message);
  }
}

console.log("\nTotal session spend:", agent.sessionSpend, "nanoERG");
