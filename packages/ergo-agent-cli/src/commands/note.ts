// `ergo-agent note <check|issue|redeem>` — Note lifecycle subcommands.

import { ErgoAgentPay, computeTaskHash, validateTaskHash } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { ArgError, optionalString, requireString } from "../args.js";
import { emit, formatNanoErgs } from "../output.js";
import type { CliConfig } from "../config.js";
import { requireAddress } from "../config.js";

export async function noteCommand(args: ParsedArgs, config: CliConfig): Promise<void> {
  const sub = args.positional[1];
  switch (sub) {
    case "check":
      return checkNote(args, config);
    case "issue":
      return issueNote(args, config);
    case "redeem":
      return redeemNote(args, config);
    case undefined:
      throw new ArgError("note subcommand required: check | issue | redeem. See --help.");
    default:
      throw new ArgError(
        `Unknown note subcommand: "${sub}". Expected: check | issue | redeem.`
      );
  }
}

async function checkNote(args: ParsedArgs, config: CliConfig): Promise<void> {
  const boxId = args.positional[2];
  if (!boxId) throw new ArgError("Usage: ergo-agent note check <boxId>");

  const agent = new ErgoAgentPay({
    address: config.address || "9hRjC9Sxc1ASEqp7w4dV8mY1ZGcRGbvTUmPuctYzCwGu7AHWvQ7",
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const info = await agent.checkNote(boxId);

  emit(
    { json: config.json },
    {
      box_id: info.boxId,
      value_nano_erg: info.value.toString(),
      value_erg: info.ergs,
      expiry_block: info.expiryBlock,
      current_block: info.currentBlock,
      is_expired: info.isExpired,
      reserve_box_id: info.reserveBoxId,
      task_hash: info.taskHash,
      credential_key: info.credentialKey,
    },
    [
      ["Box ID", info.boxId],
      ["Value", formatNanoErgs(info.value)],
      ["Expires at", `${info.expiryBlock} (current: ${info.currentBlock})`],
      ["Status", info.isExpired ? "expired" : "active"],
      ["Reserve", info.reserveBoxId ?? "—"],
      ["Task hash", info.taskHash ?? "—"],
      ["Credential", info.credentialKey ?? "—"],
    ]
  );
}

async function issueNote(args: ParsedArgs, config: CliConfig): Promise<void> {
  const recipient = requireString(args.flags, "recipient");
  const value = requireString(args.flags, "value");
  const reserveBoxId = requireString(args.flags, "reserve");
  const deadline = requireString(args.flags, "deadline");

  let taskHash = optionalString(args.flags, "task-hash");
  const taskOutput = optionalString(args.flags, "task-output");

  if (taskHash !== undefined && taskOutput !== undefined) {
    throw new ArgError("Pass either --task-hash or --task-output, not both.");
  }
  if (taskOutput !== undefined) {
    taskHash = computeTaskHash(taskOutput);
  }
  if (taskHash !== undefined) validateTaskHash(taskHash);

  const credentialKey = optionalString(args.flags, "credential-key");
  const scriptErgoTree = optionalString(args.flags, "script");

  const address = requireAddress(config);
  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const result = await agent.issueNote({
    recipient,
    value,
    reserveBoxId,
    deadline: parseDeadline(deadline),
    taskHash,
    credentialKey,
    scriptErgoTree,
  });

  emit({ json: config.json }, {
    submitted: result.submitted,
    tx_id: result.txId,
    note_output: result.noteOutput,
    unsigned_tx: result.unsignedTx,
  });
}

async function redeemNote(args: ParsedArgs, config: CliConfig): Promise<void> {
  const noteBoxId = requireString(args.flags, "box");
  const taskOutput = optionalString(args.flags, "task-output");
  const receiverAddress = optionalString(args.flags, "receiver");

  const address = requireAddress(config);
  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const result = await agent.redeemNote({
    noteBoxId,
    taskOutput,
    receiverAddress,
  });

  emit({ json: config.json }, {
    submitted: result.submitted,
    tx_id: result.txId,
    redeemed: result.redeemed,
    unsigned_tx: result.unsignedTx,
  });
}

function parseDeadline(raw: string): number | `+${number} blocks` | `+${number} block` {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const match = raw.match(/^\+(\d+)\s*blocks?$/i);
  if (!match) {
    throw new ArgError(
      `Invalid --deadline "${raw}". Use an absolute block height or "+N blocks".`
    );
  }
  return raw as `+${number} blocks` | `+${number} block`;
}
