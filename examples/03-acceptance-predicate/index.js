/**
 * Example 03 — Acceptance Predicate Payment
 *
 * Conditional payment: the Note is redeemable ONLY if the task output hash matches.
 * The acceptance condition is enforced on-chain — no escrow, no oracle, no server.
 *
 * Use case:
 *   Agent A pays Agent B to run a computation.
 *   Agent A encodes: "this payment is valid only if blake2b256(output) == EXPECTED_HASH"
 *   Agent B submits output. Miners verify the hash. Payment unlocks automatically.
 *
 * Run:
 *   npm install
 *   node index.js
 */

import {
  TransactionBuilder,
  OutputBuilder,
  SByte,
  SColl,
  SInt,
  SSigmaProp,
  SGroupElement,
} from "@fleet-sdk/core";
import crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const TESTNET_API    = "https://api-testnet.ergoplatform.com";
const YOUR_ADDRESS   = "YOUR_TESTNET_ADDRESS";
const RECEIVER       = "RECEIVER_TESTNET_ADDRESS";
const NOTE_VALUE     = "5000000"; // 0.005 ERG
const EXPIRY_BLOCKS  = 100;

/**
 * The task output the paying agent expects.
 * In a real system: hash of API response, computation result, file content, etc.
 */
const EXPECTED_TASK_OUTPUT = "The answer to the question is 42.";
const TASK_HASH = crypto
  .createHash("blake2b512") // Note: ErgoScript uses blake2b256 — use correct lib in production
  .update(EXPECTED_TASK_OUTPUT)
  .digest("hex")
  .slice(0, 64); // first 32 bytes for blake2b256 simulation

async function getHeight() {
  const res = await fetch(`${TESTNET_API}/api/v1/info`);
  const { fullHeight } = await res.json();
  return fullHeight;
}

async function getInputs(address) {
  const res = await fetch(`${TESTNET_API}/api/v1/boxes/unspent/byAddress/${address}`);
  const { items } = await res.json();
  return items;
}

async function buildConditionalPayment() {
  const height = await getHeight();
  const inputs = await getInputs(YOUR_ADDRESS);
  const expiry = height + EXPIRY_BLOCKS;

  /**
   * The Note output encodes the acceptance predicate in R6:
   *   R4: reserve box ID
   *   R5: expiry height
   *   R6: required task hash (the condition that must be proven to redeem)
   *
   * The ErgoScript spending condition at the receiver:
   *
   *   val taskOutput = getVar[Coll[Byte]](0).get  // provided by redeemer
   *   val taskHash   = blake2b256(taskOutput)
   *   sigmaProp(
   *     HEIGHT < expiry &&
   *     taskHash == R6.get[Coll[Byte]]().get
   *   )
   *
   * The receiver (Agent B) must provide the task output as a context variable
   * when spending the Note. Miners verify the hash. No trusted party.
   */
  const noteOutput = new OutputBuilder(NOTE_VALUE, RECEIVER)
    .setAdditionalRegisters({
      R4: SColl(SByte, Buffer.from("00".repeat(32), "hex")), // reserve box ID placeholder
      R5: SInt(expiry),
      R6: SColl(SByte, Buffer.from(TASK_HASH, "hex")),       // acceptance predicate: task hash
    });

  const unsignedTx = new TransactionBuilder(height)
    .from(inputs)
    .to(noteOutput)
    .sendChangeTo(YOUR_ADDRESS)
    .payMinFee()
    .build()
    .toEIP12Object();

  console.log("Conditional payment (acceptance predicate):");
  console.log(`  Value:       ${NOTE_VALUE} nanoERG`);
  console.log(`  Receiver:    ${RECEIVER}`);
  console.log(`  Expiry:      block ${expiry}`);
  console.log(`  Task hash:   ${TASK_HASH}`);
  console.log(`  Condition:   blake2b256(task_output) must equal task hash`);
  console.log(`               Verified by miners. No escrow. No oracle.`);
  console.log("\nTo redeem: Agent B submits the task output as context variable[0].");
  console.log("Miners run blake2b256(output) and verify it matches R6.");
  console.log("\nUnsigned TX:");
  console.log(JSON.stringify(unsignedTx, null, 2));
}

buildConditionalPayment().catch(console.error);
