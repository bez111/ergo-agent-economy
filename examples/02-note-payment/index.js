/**
 * Example 02 — Note Payment (Programmable Bearer IOU)
 *
 * Issues a Note — a bearer instrument with expiry and reserve reference.
 * The receiver can redeem it against the Reserve box before the deadline.
 *
 * This is the core agent payment primitive in Ergo's agent economy stack.
 * Notes are transferred between agents as payment without round-trips to the issuer.
 *
 * Run:
 *   npm install
 *   node index.js
 */

import { TransactionBuilder, OutputBuilder, SByte, SColl, SInt } from "@fleet-sdk/core";

// ── Config ────────────────────────────────────────────────────────────────────
const TESTNET_API    = "https://api-testnet.ergoplatform.com";
const YOUR_ADDRESS   = "YOUR_TESTNET_ADDRESS";   // ← issuer address
const RECEIVER       = "RECEIVER_TESTNET_ADDRESS"; // ← agent receiving payment
const RESERVE_BOX_ID = "RESERVE_BOX_ID";         // ← ID of the Reserve UTxO
const NOTE_VALUE     = "5000000";                // 0.005 ERG
const EXPIRY_BLOCKS  = 100;                      // Note expires in 100 blocks (~3.5 hours)

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

async function buildNote() {
  const height  = await getHeight();
  const inputs  = await getInputs(YOUR_ADDRESS);
  const expiry  = height + EXPIRY_BLOCKS;

  /**
   * The Note output encodes in registers:
   *   R4: reserve box ID (identifies which Reserve backs this Note)
   *   R5: expiry block height (Note is invalid after this block)
   *
   * The spending script at the receiver side would check:
   *   HEIGHT < expiry && noteValue >= requiredPrice
   */
  const noteOutput = new OutputBuilder(NOTE_VALUE, RECEIVER)
    .setAdditionalRegisters({
      R4: SColl(SByte, Buffer.from(RESERVE_BOX_ID, "hex")), // reserve box ID
      R5: SInt(expiry),                                      // expiry height
    });

  const unsignedTx = new TransactionBuilder(height)
    .from(inputs)
    .to(noteOutput)
    .sendChangeTo(YOUR_ADDRESS)
    .payMinFee()
    .build()
    .toEIP12Object();

  console.log(`Note output:`);
  console.log(`  Value:    ${NOTE_VALUE} nanoERG (${Number(NOTE_VALUE) / 1e9} ERG)`);
  console.log(`  Receiver: ${RECEIVER}`);
  console.log(`  Expiry:   block ${expiry} (~${EXPIRY_BLOCKS} blocks from now)`);
  console.log(`  Reserve:  ${RESERVE_BOX_ID}`);
  console.log("\nUnsigned TX (EIP-12):");
  console.log(JSON.stringify(unsignedTx, null, 2));
}

buildNote().catch(console.error);
