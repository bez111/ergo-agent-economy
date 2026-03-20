// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Transaction Builder
// ─────────────────────────────────────────────────────────────────────────────

import {
  TransactionBuilder,
  OutputBuilder,
  SColl,
  SByte,
  SInt,
  SAFE_MIN_BOX_VALUE,
} from "@fleet-sdk/core";
import type { PayOptions, NoteOptions, EIP12UnsignedTx } from "./types.js";
import { ErgoAgentPayError } from "./types.js";
import { resolveDeadline, validateTaskHash, encodeToHex } from "./predicates.js";

const NANOERG_PER_ERG = 1_000_000_000n;

/** Parse human-readable amount to nanoERG bigint */
export function parseAmount(amount: bigint | string | number): bigint {
  if (typeof amount === "bigint") return amount;

  const str = String(amount).trim();

  // "0.001 ERG" or "0.001erg"
  const ergMatch = str.match(/^([0-9.]+)\s*ERG?$/i);
  if (ergMatch && ergMatch[1]) {
    const [whole, frac = ""] = ergMatch[1].split(".");
    const fracPadded = frac.padEnd(9, "0").slice(0, 9);
    return BigInt(whole) * NANOERG_PER_ERG + BigInt(fracPadded);
  }

  // Plain number (nanoERG)
  if (/^\d+$/.test(str)) return BigInt(str);

  throw new ErgoAgentPayError(
    `Invalid amount: "${amount}". Use nanoERG (integer) or ERG string like "0.001 ERG".`,
    "INVALID_AMOUNT"
  );
}

/** Build a simple payment transaction */
export function buildPayTx(
  inputs: unknown[],
  height: number,
  senderAddress: string,
  receiverAddress: string,
  amountNanoErg: bigint,
  options: PayOptions = {}
): EIP12UnsignedTx {
  if (amountNanoErg < BigInt(SAFE_MIN_BOX_VALUE)) {
    throw new ErgoAgentPayError(
      `Amount ${amountNanoErg} nanoERG is below minimum box value (${SAFE_MIN_BOX_VALUE} nanoERG).`,
      "INVALID_AMOUNT"
    );
  }

  let output = new OutputBuilder(amountNanoErg.toString(), receiverAddress);

  if (options.memo) {
    output = output.setAdditionalRegisters({
      R4: SColl(SByte, hexToBytes(encodeToHex(options.memo))),
    });
  }

  return new TransactionBuilder(height)
    .from(inputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(output)
    .sendChangeTo(senderAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;
}

/** Build a Note (bearer IOU) transaction */
export function buildNoteTx(
  inputs: unknown[],
  height: number,
  senderAddress: string,
  opts: NoteOptions
): EIP12UnsignedTx {
  const amountNanoErg = parseAmount(opts.value);

  if (amountNanoErg < BigInt(SAFE_MIN_BOX_VALUE)) {
    throw new ErgoAgentPayError(
      `Note value ${amountNanoErg} nanoERG is below minimum box value.`,
      "INVALID_AMOUNT"
    );
  }

  const expiryBlock = resolveDeadline(opts.deadline, height);

  const registers: Record<string, unknown> = {
    R4: SColl(SByte, hexToBytes(opts.reserveBoxId)), // reserve box ID
    R5: SInt(expiryBlock),                           // expiry height
  };

  if (opts.taskHash) {
    validateTaskHash(opts.taskHash);
    registers.R6 = SColl(SByte, hexToBytes(opts.taskHash));
  }

  if (opts.credentialKey) {
    registers[opts.taskHash ? "R7" : "R6"] = opts.credentialKey;
  }

  const output = new OutputBuilder(amountNanoErg.toString(), opts.recipient)
    .setAdditionalRegisters(registers as Parameters<typeof OutputBuilder.prototype.setAdditionalRegisters>[0]);

  return new TransactionBuilder(height)
    .from(inputs as Parameters<typeof TransactionBuilder.prototype.from>[0])
    .to(output)
    .sendChangeTo(senderAddress)
    .payMinFee()
    .build()
    .toEIP12Object() as EIP12UnsignedTx;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new ErgoAgentPayError(`Invalid hex string length: ${hex}`, "INVALID_HASH");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
