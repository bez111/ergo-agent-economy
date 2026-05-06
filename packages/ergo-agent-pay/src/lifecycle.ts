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
//   to ergoTree bytes using ergo-lib-wasm or AppKit. Pass the result as the
//   `scriptErgoTree` parameter.
//
//   These are RAW builders. They do NOT enforce mainnet safety — omitting
//   `scriptErgoTree` produces a P2PK box and the predicate stored in R6/R7
//   becomes advisory only. The high-level `ErgoAgentPay` class wraps these
//   builders with `assertProductionSafety()`; if you call them directly,
//   call that helper yourself before signing on mainnet.
//
//   See SPEC.md for the formal Reserve / Note / Tracker v0 spec.
// ─────────────────────────────────────────────────────────────────────────────

import { TransactionBuilder, OutputBuilder, SByte, SColl } from "@fleet-sdk/core";
import type { ReserveConfig, ReserveResult, RedeemOptions, RedeemResult, BatchSettleOptions, BatchSettleResult, TrackerConfig, TrackerResult, EIP12UnsignedTx } from "./types.js";
import { ErgoAgentPayError } from "./types.js";
import { parseAmount } from "./transactions.js";
import { encodeSigmaCollByte } from "./encoding.js";

// ── Reserve ──────────────────────────────────────────────────────────────────

/**
 * Build a TX that creates a Reserve box — the collateral backing a Note system.
 *
 * @param inputs        - UTxOs from the deployer's address
 * @param height        - current block height
 * @param deployerAddress - address that funds + controls the Reserve
 * @param config        - Reserve configuration
 */
export function dangerouslyBuildCreateReserveTx(
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
export function dangerouslyBuildRedeemNoteTx(
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

  // Inject context variable 0 for acceptance predicate.
  // encodeSigmaCollByte enforces v0 length cap; throws INVALID_ENCODING above 255 bytes.
  if (opts.taskOutput) {
    const taskBytes =
      typeof opts.taskOutput === "string"
        ? Array.from(new TextEncoder().encode(opts.taskOutput))
        : Array.from(opts.taskOutput);
    const inputs = (unsignedTx as { inputs: { boxId: string; extension?: Record<string, string> }[] }).inputs;
    if (inputs[0]) {
      inputs[0].extension = { "0": encodeSigmaCollByte(taskBytes) };
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
export function dangerouslyBuildBatchSettleTx(
  noteBoxes: unknown[],
  feeInputs: unknown[],
  height: number,
  agentAddress: string,
  opts: BatchSettleOptions
): EIP12UnsignedTx {
  const receiver = opts.receiverAddress ?? agentAddress;
  const allInputs = [...noteBoxes, ...feeInputs];

  const totalValue = (noteBoxes as { value: string | number | bigint }[]).reduce<bigint>((sum, box) => {
    return sum + BigInt(box.value);
  }, 0n);

  const unsignedTx = new TransactionBuilder(height)
    .from(allInputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(new OutputBuilder(totalValue.toString(), receiver))
    .sendChangeTo(agentAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;

  // Inject context variables for predicate-protected Notes.
  // encodeSigmaCollByte enforces v0 length cap; throws INVALID_ENCODING above 255 bytes.
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
        inputs[i].extension = { "0": encodeSigmaCollByte(taskBytes) };
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
export function dangerouslyBuildDeployTrackerTx(
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
  // SInt type: 0x04 prefix, then zigzag-encoded value.
  //
  // L-003: parse via BigInt so values above 2^53 don't silently lose
  // precision. Real registers we read here (R5 expiry block height) fit in
  // 2^31, so the bigint path always converges back to a safe Number.
  // Anything outside the safe range raises rather than silently truncates.
  const valueHex = hex.slice(2);
  const zigzagBig = BigInt("0x" + valueHex);
  const decoded = (zigzagBig >> 1n) ^ -(zigzagBig & 1n);
  if (
    decoded > BigInt(Number.MAX_SAFE_INTEGER) ||
    decoded < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new ErgoAgentPayError(
      `Register integer ${decoded} is outside the JS safe-integer range. ` +
        `Decode it as bigint manually or open an issue if this is hit on R5.`,
      "INVALID_ENCODING"
    );
  }
  return Number(decoded);
}

export function decodeRegisterBytes(hex: string): string {
  if (!hex || hex.length < 4) return "";
  // SColl[SByte] type: 0e prefix, then length byte, then content
  return hex.slice(4); // skip type byte (0e) + length byte
}

// ── Deprecated aliases ───────────────────────────────────────────────────────
//
// The unprefixed names are kept for one minor-version cycle. New code MUST
// use the `dangerouslyBuild*` names; they signal that the function bypasses
// the SDK's audit/safety guardrails and the caller is on the hook for
// running their own audit policy before signing on mainnet.

/** @deprecated Use `dangerouslyBuildCreateReserveTx` — see module docs. */
export const buildCreateReserveTx = dangerouslyBuildCreateReserveTx;

/** @deprecated Use `dangerouslyBuildRedeemNoteTx` — see module docs. */
export const buildRedeemNoteTx = dangerouslyBuildRedeemNoteTx;

/** @deprecated Use `dangerouslyBuildBatchSettleTx` — see module docs. */
export const buildBatchSettleTx = dangerouslyBuildBatchSettleTx;

/** @deprecated Use `dangerouslyBuildDeployTrackerTx` — see module docs. */
export const buildDeployTrackerTx = dangerouslyBuildDeployTrackerTx;
