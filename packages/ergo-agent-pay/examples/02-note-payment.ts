/**
 * Example 02 — Note Payment (Programmable Bearer IOU)
 *
 * Issue a Note with a task hash acceptance predicate.
 * The receiver can only redeem it by providing the correct task output.
 *
 * Run: npx tsx examples/02-note-payment.ts
 */

import { ErgoAgentPay, computeTaskHashAsync } from "../src/index.js";

const agent = new ErgoAgentPay({
  address: "YOUR_TESTNET_ADDRESS",
  network: "testnet",
  policy: {
    maxSinglePayment: 10_000_000n, // max 0.01 ERG per payment
    afterPay: async (ctx, result) => {
      console.log(`[policy] Paid ${ctx.value} nanoERG → txId: ${result.txId ?? "(unsigned)"}`);
    },
  },
});

// The task we expect the sub-agent to complete
const EXPECTED_OUTPUT = "The answer to the computation is: 42";

// Compute the acceptance predicate hash
const taskHash = await computeTaskHashAsync(EXPECTED_OUTPUT);
console.log("Task hash:", taskHash);

const result = await agent.issueNote({
  recipient: "3WwbzW6u8hKWBcL1W7kNVMr25s2UHfSBnYtwSHvrRQt7DdPuoXrt",
  value: "0.005 ERG",
  reserveBoxId: "0000000000000000000000000000000000000000000000000000000000000000",
  deadline: "+100 blocks",
  taskHash,
});

console.log("Note issued:");
console.log("  Value:      ", result.noteOutput.value, "nanoERG");
console.log("  Recipient:  ", result.noteOutput.recipient);
console.log("  Expiry:     block", result.noteOutput.expiryBlock);
console.log("  Task hash:  ", result.noteOutput.taskHash);
console.log("  Submitted:  ", result.submitted);
console.log("\nSession spend:", agent.sessionSpend, "nanoERG");
