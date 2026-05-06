// `ergo-agent tracker <deploy>` — Tracker lifecycle subcommands.

import { ErgoAgentPay } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { ArgError, requireString } from "../args.js";
import { emit } from "../output.js";
import type { CliConfig } from "../config.js";
import { requireAddress } from "../config.js";

export async function trackerCommand(args: ParsedArgs, config: CliConfig): Promise<void> {
  const sub = args.positional[1];
  if (sub === "deploy") return deployTracker(args, config);
  if (sub === undefined) {
    throw new ArgError("tracker subcommand required: deploy. See --help.");
  }
  throw new ArgError(`Unknown tracker subcommand: "${sub}". Expected: deploy.`);
}

async function deployTracker(args: ParsedArgs, config: CliConfig): Promise<void> {
  const scriptErgoTree = requireString(args.flags, "script");

  const address = requireAddress(config);
  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const result = await agent.deployTracker({ scriptErgoTree });

  emit({ json: config.json }, {
    submitted: result.submitted,
    tx_id: result.txId,
    tracker: result.tracker,
    unsigned_tx: result.unsignedTx,
  });
}
