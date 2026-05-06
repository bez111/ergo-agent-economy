// `ergo-agent height` — current Ergo block height.

import { ErgoAgentPay } from "ergo-agent-pay";
import type { ParsedArgs } from "../args.js";
import { emit } from "../output.js";
import type { CliConfig } from "../config.js";

export async function heightCommand(_args: ParsedArgs, config: CliConfig): Promise<void> {
  // height does not require an address; pass a placeholder so the SDK
  // construct succeeds. The placeholder is never used as a query target.
  const agent = new ErgoAgentPay({
    address: config.address || "9hRjC9Sxc1ASEqp7w4dV8mY1ZGcRGbvTUmPuctYzCwGu7AHWvQ7",
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });

  const height = await agent.getHeight();

  if (config.json) {
    emit({ json: true }, { height, network: config.network });
  } else {
    process.stdout.write(`${height}\n`);
  }
}
