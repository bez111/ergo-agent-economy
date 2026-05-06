// `ergo-agent settle` — batch-redeem multiple Notes in one transaction.

import { ErgoAgentPay } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { ArgError, optionalString, requireString } from "../args.js";
import { emit } from "../output.js";
import type { CliConfig } from "../config.js";
import { requireAddress } from "../config.js";

export async function settleCommand(args: ParsedArgs, config: CliConfig): Promise<void> {
  const boxesRaw = requireString(args.flags, "boxes");
  const noteBoxIds = boxesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (noteBoxIds.length === 0) {
    throw new ArgError("--boxes must contain at least one boxId (comma-separated)");
  }

  const taskOutputsRaw = optionalString(args.flags, "task-outputs");
  const taskOutputs = taskOutputsRaw ? parseTaskOutputs(taskOutputsRaw) : undefined;

  const receiverAddress = optionalString(args.flags, "receiver");

  const address = requireAddress(config);
  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const result = await agent.settleBatch({
    noteBoxIds,
    taskOutputs,
    receiverAddress,
  });

  emit({ json: config.json }, {
    submitted: result.submitted,
    tx_id: result.txId,
    settlement: result.settlement,
    unsigned_tx: result.unsignedTx,
  });
}

/** Parse `boxId=text;boxId=text;...` into a record. */
function parseTaskOutputs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs = raw.split(";").map((p) => p.trim()).filter(Boolean);
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new ArgError(
        `--task-outputs entries must be "boxId=output" (got "${pair}"). Separate multiple entries with ";".`
      );
    }
    const boxId = pair.slice(0, eq).trim();
    const output = pair.slice(eq + 1);
    if (!boxId) throw new ArgError("--task-outputs has an empty boxId");
    out[boxId] = output;
  }
  return out;
}
