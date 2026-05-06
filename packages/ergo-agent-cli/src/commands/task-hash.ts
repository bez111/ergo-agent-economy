// `ergo-agent task-hash <input>` — compute BLAKE2b-256 of the input.
// Input modes:
//   - positional argument:  ergo-agent task-hash "the answer is 42"
//   - --hex <bytes>:        ergo-agent task-hash --hex 0102deadbeef
//   - --file <path>:        ergo-agent task-hash --file payload.json
//   - --stdin:              echo "..." | ergo-agent task-hash --stdin
//
// Output is the 64-char hex digest, with no trailing punctuation in human mode
// (so `$(...)` capture works), or `{ "task_hash": "..." }` in JSON mode.

import { readFile } from "node:fs/promises";
import { computeTaskHash } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { ArgError, optionalString, optionalBoolean } from "../args.js";
import { emit } from "../output.js";
import type { CliConfig } from "../config.js";

export async function taskHashCommand(args: ParsedArgs, config: CliConfig): Promise<void> {
  const hex = optionalString(args.flags, "hex");
  const file = optionalString(args.flags, "file");
  const fromStdin = optionalBoolean(args.flags, "stdin");
  const positional = args.positional[1];

  const sources = [hex, file, fromStdin ? "stdin" : undefined, positional]
    .filter((v) => v !== undefined).length;
  if (sources === 0) {
    throw new ArgError(
      'task-hash needs an input. Pass a positional string, --hex <bytes>, --file <path>, or --stdin.'
    );
  }
  if (sources > 1) {
    throw new ArgError(
      "task-hash accepts exactly one of: positional, --hex, --file, --stdin."
    );
  }

  let bytes: Uint8Array;

  if (hex !== undefined) {
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
      throw new ArgError(`--hex must be an even-length hex string (got "${hex}")`);
    }
    bytes = hexToBytes(hex);
  } else if (file !== undefined) {
    bytes = new Uint8Array(await readFile(file));
  } else if (fromStdin) {
    bytes = new Uint8Array(await readStdin());
  } else {
    bytes = new TextEncoder().encode(positional ?? "");
  }

  const digest = computeTaskHash(bytes);

  if (config.json) {
    emit({ json: true }, { task_hash: digest, algorithm: "BLAKE2b-256", input_bytes: bytes.length });
  } else {
    process.stdout.write(`${digest}\n`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
