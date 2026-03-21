/**
 * Example 04 — Orchestrator Budget Delegation
 *
 * An orchestrator agent issues budgeted Notes to 3 sub-agents.
 * Each sub-agent has a spending cap enforced by policy.
 * Notes carry acceptance predicates — payment only releases when the
 * sub-agent proves task completion (blake2b256(output) == taskHash).
 *
 * Architecture:
 *   Orchestrator
 *     ├── sub-agent-A: "analyze sentiment"  → 0.002 ERG
 *     ├── sub-agent-B: "summarize document" → 0.003 ERG
 *     └── sub-agent-C: "translate text"     → 0.001 ERG
 *
 * This example is self-contained — it builds unsigned TXs and prints them.
 * No live network calls; replace the mock data with real UTxOs to run on testnet.
 *
 * Run:
 *   npm install
 *   node index.js
 */

import crypto from "node:crypto";
import { TransactionBuilder, OutputBuilder, SInt, SByte, SColl } from "@fleet-sdk/core";

// ── Config ────────────────────────────────────────────────────────────────────
const TESTNET_API   = "https://api-testnet.ergoplatform.com";
const RESERVE_BOX_ID = "a" + "0".repeat(63); // placeholder — replace with real reserve boxId

// In a real deployment these would be live agent addresses
const ORCHESTRATOR_ADDRESS = "ORCHESTRATOR_TESTNET_ADDRESS"; // ← your address
const SUB_AGENTS = [
  { name: "sentiment-agent",  address: "SUB_AGENT_A_ADDRESS", amount: 2_000_000n, task: "analyze sentiment of Q4 earnings call transcript" },
  { name: "summary-agent",    address: "SUB_AGENT_B_ADDRESS", amount: 3_000_000n, task: "summarize the 2024 annual report into 5 bullet points" },
  { name: "translate-agent",  address: "SUB_AGENT_C_ADDRESS", amount: 1_000_000n, task: "translate product description from EN to DE" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a task hash for an acceptance predicate.
 * Production note: blake2b256 is not in Node.js crypto by default.
 * Use @noble/hashes in production:
 *   import { blake2b } from "@noble/hashes/blake2b"
 *   Buffer.from(blake2b(input, { dkLen: 32 })).toString("hex")
 */
function computeTaskHash(taskDescription) {
  return crypto.createHash("sha256").update(taskDescription).digest("hex");
}

/**
 * Build a Note issuance TX for a single sub-agent.
 * The Note is redeemable only if the agent provides taskOutput whose
 * sha256 matches taskHash (swap for blake2b256 on-chain in production).
 */
function buildNoteIssuanceTx(inputs, height, orchestratorAddress, subAgent, taskHash, currentBlock) {
  const DEADLINE = currentBlock + 200; // Note valid for ~200 blocks (~3.3 hrs on Ergo)

  const noteOutput = new OutputBuilder(subAgent.amount, subAgent.address)
    .setAdditionalRegisters({
      // R4: reserve box ID (bytes)
      R4: SColl(SByte, Array.from(Buffer.from(RESERVE_BOX_ID, "hex"))),
      // R5: expiry block height
      R5: SInt(DEADLINE),
      // R6: task hash — acceptance predicate (32 bytes)
      R6: SColl(SByte, Array.from(Buffer.from(taskHash, "hex"))),
    });

  return new TransactionBuilder(height)
    .from(inputs)
    .to(noteOutput)
    .sendChangeTo(orchestratorAddress)
    .payMinFee()
    .build()
    .toEIP12Object();
}

// ── Mock data (replace with live API calls) ───────────────────────────────────

async function getHeight() {
  // Uncomment for live testnet:
  // const res = await fetch(`${TESTNET_API}/api/v1/info`);
  // return (await res.json()).fullHeight;
  return 1_200_000; // mock height
}

async function getInputs(address) {
  // Uncomment for live testnet:
  // const res = await fetch(`${TESTNET_API}/api/v1/boxes/unspent/byAddress/${address}`);
  // return (await res.json()).items ?? [];
  return [
    {
      boxId: "b" + "0".repeat(63),
      value: "20000000", // 0.02 ERG — enough to issue 3 Notes + fees
      ergoTree: "0008cd" + "0".repeat(66),
      creationHeight: 1_199_900,
      assets: [],
      additionalRegisters: {},
      transactionId: "c" + "0".repeat(63),
      index: 0,
    },
  ];
}

// ── Orchestration logic ───────────────────────────────────────────────────────

async function orchestrate() {
  console.log("=== Orchestrator Budget Delegation Demo ===\n");

  const height = await getHeight();
  const inputs = await getInputs(ORCHESTRATOR_ADDRESS);

  if (!inputs.length) {
    console.error("No UTxOs found. Fund your address at https://testnet.ergofaucet.org");
    process.exit(1);
  }

  const totalBudget = SUB_AGENTS.reduce((s, a) => s + a.amount, 0n);
  console.log(`Orchestrator issuing Notes to ${SUB_AGENTS.length} sub-agents`);
  console.log(`Total budget: ${Number(totalBudget) / 1e9} ERG\n`);

  for (const subAgent of SUB_AGENTS) {
    const taskHash = computeTaskHash(subAgent.task);

    console.log(`── ${subAgent.name}`);
    console.log(`   Task:      ${subAgent.task}`);
    console.log(`   Amount:    ${Number(subAgent.amount) / 1e9} ERG`);
    console.log(`   TaskHash:  ${taskHash}`);

    const unsignedTx = buildNoteIssuanceTx(
      inputs,
      height,
      ORCHESTRATOR_ADDRESS,
      subAgent,
      taskHash,
      height
    );

    console.log(`   Unsigned TX inputs:  ${unsignedTx.inputs.length}`);
    console.log(`   Unsigned TX outputs: ${unsignedTx.outputs.length}`);
    console.log();
  }

  console.log("=== Sub-agent redemption flow ===\n");
  console.log("When a sub-agent completes its task:");
  console.log("  1. Agent calls agent.redeemNote({ noteBoxId, taskOutput: actualOutput })");
  console.log("  2. SDK injects taskOutput as context variable 0 in the spending TX");
  console.log("  3. On-chain script verifies: blake2b256(ctx[0]) == R6");
  console.log("  4. ERG releases to sub-agent's address\n");

  console.log("=== Policy limits (example) ===\n");
  console.log("Orchestrator config with per-session spend cap:");
  console.log(
    JSON.stringify(
      {
        address: ORCHESTRATOR_ADDRESS,
        network: "testnet",
        policy: {
          maxSinglePayment: "5000000",   // 0.005 ERG max per Note
          maxSessionSpend:  "10000000",  // 0.01 ERG total per session
          requireApprovalAbove: "3000000",
        },
      },
      null,
      2
    )
  );
}

orchestrate().catch(console.error);
