// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Lifecycle Transaction Builders
//
// Helpers for the full Note/Reserve lifecycle beyond simple issuance:
//   - createReserve  → deploy a Reserve collateral box
//   - redeemNote     → spend a Note, release ERG to receiver
//   - deployTracker  → create an anti-double-spend Tracker box
//   - settleBatch    → redeem multiple Notes in one transaction
//
// All functions return EIP-12 unsigned transactions for external signing,
// or use the agent's signer if configured.
//
// Note on ErgoScript compilation:
//   Full on-chain scripts (Reserve guard, Tracker update logic) must be compiled
//   to ergoTree bytes using ergo-lib-wasm or AppKit.
//   Pass the result as `scriptErgoTree` parameter.
//   For development/testing, omitting scriptErgoTree creates P2PK boxes
//   (semantics enforced off-chain only — fine for demos, not production).
// ─────────────────────────────────────────────────────────────────────────────

import { TransactionBuilder, OutputBuilder, SByte, SColl } from "@fleet-sdk/core";
import type { ReserveConfig, ReserveResult, RedeemOptions, RedeemResult, BatchSettleOptions, BatchSettleResult, TrackerConfig, TrackerResult, EIP12UnsignedTx } from "./types.js";
import { ErgoAgentPayError } from "./types.js";
import { parseAmount } from "./transactions.js";

// ── Reserve ──────────────────────────────────────────────────────────────────

/**
 * Build a TX that creates a Reserve box — the collateral backing a Note system.
 *
 * @param inputs        - UTxOs from the deployer's address
 * @param height        - current block height
 * @param deployerAddress - address that funds + controls the Reserve
 * @param config        - Reserve configuration
 */
export function buildCreateReserveTx(
  inputs: unknown[],
  height: number,
  deployerAddress: string,
  config: ReserveConfig
): EIP12UnsignedTx {
  const collateral = parseAmount(config.collateral);

  let reserveOutput: OutputBuilder;

  if (config.scriptErgoTree) {
    // True on-chain Reserve: spending governed by the ErgoScript
    reserveOutput = new OutputBuilder(collateral, config.scriptErgoTree);
  } else {
    // Development: P2PK reserve — semantics are off-chain only
    reserveOutput = new OutputBuilder(collateral, deployerAddress);
  }

  if (config.memo) {
    reserveOutput.setAdditionalRegisters({
      R4: SColl(SByte, Array.from(new TextEncoder().encode(config.memo))),
    });
  }

  return new TransactionBuilder(height)
    .from(inputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(reserveOutput)
    .sendChangeTo(deployerAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;
}

// ── Note redemption ───────────────────────────────────────────────────────────

/**
 * Build a TX that redeems a Note and releases its ERG to the receiver.
 *
 * For Notes with acceptance predicates (taskHash in R6), the `taskOutput`
 * is encoded as context variable 0 in the input's extension field.
 * The on-chain script calls `blake2b256(getVar[Coll[Byte]](0).get)` and
 * verifies it matches R6 before releasing funds.
 *
 * @param noteBox       - the Note UTxO object (from API)
 * @param inputs        - additional UTxOs for fee coverage
 * @param height        - current block height
 * @param agentAddress  - change address
 * @param opts          - redeem options (receiver, taskOutput)
 */
export function buildRedeemNoteTx(
  noteBox: unknown,
  feeInputs: unknown[],
  height: number,
  agentAddress: string,
  opts: RedeemOptions
): EIP12UnsignedTx {
  const box = noteBox as { boxId: string; value: string | number | bigint };
  const noteValue = BigInt(box.value);
  const receiver = opts.receiverAddress ?? agentAddress;

  // Spend the Note box + agent boxes for fee coverage
  const allInputs = [noteBox, ...feeInputs];

  const unsignedTx = new TransactionBuilder(height)
    .from(allInputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(new OutputBuilder(noteValue, receiver))
    .sendChangeTo(agentAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;

  // Inject context variable 0 for acceptance predicate
  if (opts.taskOutput) {
    const taskBytes =
      typeof opts.taskOutput === "string"
        ? Array.from(new TextEncoder().encode(opts.taskOutput))
        : Array.from(opts.taskOutput);
    const hexTask = taskBytes.map((b) => b.toString(16).padStart(2, "0")).join("");

    // EIP-12 extension: map from context variable index (string) to sigma-encoded value
    const inputs = (unsignedTx as { inputs: { boxId: string; extension?: Record<string, string> }[] }).inputs;
    if (inputs[0]) {
      // Context var 0 = Coll[Byte] encoding: type prefix 0e + length varint + bytes
      const lenHex = taskBytes.length.toString(16).padStart(2, "0");
      inputs[0].extension = { "0": `0e${lenHex}${hexTask}` };
    }
  }

  return unsignedTx;
}

// ── Batch settlement ──────────────────────────────────────────────────────────

/**
 * Build a TX that redeems multiple Notes in a single transaction.
 *
 * All Notes are spent as inputs. The total ERG value (minus fee) goes to the
 * receiver. Task outputs for predicate-protected Notes are injected per-input.
 *
 * @param noteBoxes     - the Note UTxO objects (from API, in same order as noteBoxIds)
 * @param feeInputs     - additional UTxOs for fee coverage
 * @param height        - current block height
 * @param agentAddress  - change address
 * @param opts          - batch settle options
 */
export function buildBatchSettleTx(
  noteBoxes: unknown[],
  feeInputs: unknown[],
  height: number,
  agentAddress: string,
  opts: BatchSettleOptions
): EIP12UnsignedTx {
  const receiver = opts.receiverAddress ?? agentAddress;
  const allInputs = [...noteBoxes, ...feeInputs];

  const totalValue = noteBoxes.reduce((sum, box) => {
    return sum + BigInt((box as { value: string | number | bigint }).value);
  }, 0n);

  const unsignedTx = new TransactionBuilder(height)
    .from(allInputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(new OutputBuilder(totalValue, receiver))
    .sendChangeTo(agentAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;

  // Inject context variables for predicate-protected Notes
  if (opts.taskOutputs) {
    const inputs = (unsignedTx as { inputs: { boxId: string; extension?: Record<string, string> }[] }).inputs;
    noteBoxes.forEach((box, i) => {
      const boxId = (box as { boxId: string }).boxId;
      const taskOutput = opts.taskOutputs?.[boxId];
      if (taskOutput && inputs[i]) {
        const taskBytes =
          typeof taskOutput === "string"
            ? Array.from(new TextEncoder().encode(taskOutput))
            : Array.from(taskOutput);
        const hexTask = taskBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
        const lenHex = taskBytes.length.toString(16).padStart(2, "0");
        inputs[i].extension = { "0": `0e${lenHex}${hexTask}` };
      }
    });
  }

  return unsignedTx;
}

// ── Tracker ───────────────────────────────────────────────────────────────────

/**
 * Build a TX that deploys a Tracker box — the anti-double-spend registry.
 *
 * The Tracker starts with an empty spent-set. On each Note redemption,
 * the redemption TX must consume this Tracker and output a new one with the
 * Note's boxId appended to the spent set.
 *
 * @param inputs          - UTxOs from the deployer's address
 * @param height          - current block height
 * @param deployerAddress - address that funds the Tracker deployment
 * @param config          - Tracker config (scriptErgoTree required for on-chain enforcement)
 */
export function buildDeployTrackerTx(
  inputs: unknown[],
  height: number,
  deployerAddress: string,
  config: TrackerConfig
): EIP12UnsignedTx {
  const MIN_BOX_VALUE = 1_000_000n; // 0.001 ERG minimum box value

  const trackerOutput = new OutputBuilder(MIN_BOX_VALUE, config.scriptErgoTree)
    .setAdditionalRegisters({
      // R4: empty spent set (Coll[Coll[Byte]] = 0 elements)
      R4: SColl(SByte, []),
    });

  return new TransactionBuilder(height)
    .from(inputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(trackerOutput)
    .sendChangeTo(deployerAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;
}

// ── Register decoding helpers ─────────────────────────────────────────────────

/**
 * Decode a register value from the Ergo API format.
 *
 * The API returns register values as hex-encoded sigma-encoded values.
 * For SInt: first bytes are type descriptor (04), followed by zigzag-encoded int.
 * For SColl[SByte]: first byte is 0e, followed by length, then bytes.
 */
export function decodeRegisterInt(hex: string): number {
  if (!hex || hex.length < 4) return 0;
  // Strip type prefix (first 2 hex chars = 1 byte)
  // SInt type: 0x04 prefix, then zigzag-encoded value
  const valueHex = hex.slice(2);
  const zigzag = parseInt(valueHex, 16);
  // Zigzag decode: n >> 1 XOR -(n & 1)
  return (zigzag >>> 1) ^ -(zigzag & 1);
}

export function decodeRegisterBytes(hex: string): string {
  if (!hex || hex.length < 4) return "";
  // SColl[SByte] type: 0e prefix, then length byte, then content
  return hex.slice(4); // skip type byte (0e) + length byte
}
