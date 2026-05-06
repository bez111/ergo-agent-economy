// `ergo-agent balance` — current ERG balance of the configured address.

import { ErgoAgentPay } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { emit } from "../output.js";
import { formatNanoErgs } from "../output.js";
import type { CliConfig } from "../config.js";
import { requireAddress } from "../config.js";

export async function balanceCommand(_args: ParsedArgs, config: CliConfig): Promise<void> {
  const address = requireAddress(config);

  const agent = new ErgoAgentPay({
    address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const balance = await agent.getBalance();
  const nanoErgs = balance.nanoErgs;

  emit(
    { json: config.json },
    {
      address,
      network: config.network,
      nano_ergs: nanoErgs.toString(),
      ergs: balance.ergs,
    },
    [
      ["Address", address],
      ["Network", config.network],
      ["Balance", formatNanoErgs(nanoErgs)],
      ["nanoERG", nanoErgs.toString()],
    ]
  );
}
