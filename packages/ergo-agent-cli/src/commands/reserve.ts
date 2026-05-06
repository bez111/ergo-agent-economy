// `ergo-agent reserve <create>` — Reserve lifecycle subcommands.

import { ErgoAgentPay } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { ArgError, optionalString, requireString } from "../args.js";
import { emit } from "../output.js";
import type { CliConfig } from "../config.js";
import { requireAddress } from "../config.js";

export async function reserveCommand(args: ParsedArgs, config: CliConfig): Promise<void> {
  const sub = args.positional[1];
  if (sub === "create") return createReserve(args, config);
  if (sub === undefined) {
    throw new ArgError("reserve subcommand required: create. See --help.");
  }
  throw new ArgError(`Unknown reserve subcommand: "${sub}". Expected: create.`);
}

async function createReserve(args: ParsedArgs, config: CliConfig): Promise<void> {
  const collateral = requireString(args.flags, "collateral");
  const scriptErgoTree = optionalString(args.flags, "script");
  const memo = optionalString(args.flags, "memo");

  const address = requireAddress(config);
  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const result = await agent.createReserve({ collateral, scriptErgoTree, memo });

  emit({ json: config.json }, {
    submitted: result.submitted,
    tx_id: result.txId,
    reserve: result.reserve,
    unsigned_tx: result.unsignedTx,
  });
}
