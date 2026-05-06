// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-cli — config resolution
//
// Resolution order (later wins): defaults → env → CLI flags. CLI defaults to
// `testnet` so `ergo-agent <cmd>` is safe to run before reading the docs;
// the SDK itself defaults to mainnet for compatibility, the CLI flips that.
// ─────────────────────────────────────────────────────────────────────────────

import type { Network } from "ergo-agent-pay";
import { ArgError, optionalBoolean, optionalString } from "./args.js";
import type { ParsedArgs } from "./args.js";

export interface CliConfig {
  address: string;
  network: Network;
  nodeUrl?: string;
  allowInsecureDevMode: boolean;
  json: boolean;
}

const VALID_NETWORKS = new Set<Network>(["mainnet", "testnet"]);

export function resolveConfig(args: ParsedArgs): CliConfig {
  const env = process.env;

  const address =
    optionalString(args.flags, "address") ??
    env.ERGO_ADDRESS ??
    "";

  const networkRaw =
    optionalString(args.flags, "network") ??
    env.ERGO_NETWORK ??
    "testnet";
  if (!VALID_NETWORKS.has(networkRaw as Network)) {
    throw new ArgError(
      `--network must be "mainnet" or "testnet" (got "${networkRaw}")`
    );
  }
  const network = networkRaw as Network;

  const nodeUrl =
    optionalString(args.flags, "node-url") ??
    env.ERGO_NODE_URL ??
    undefined;

  const allowInsecureDevMode =
    optionalBoolean(args.flags, "allow-insecure-dev-mode") ||
    env.ERGO_ALLOW_INSECURE_DEV_MODE === "1" ||
    env.ERGO_ALLOW_INSECURE_DEV_MODE === "true";

  const json = optionalBoolean(args.flags, "json");

  return { address, network, nodeUrl, allowInsecureDevMode, json };
}

/** For commands that need an address. Throws with a clear hint if it's missing. */
export function requireAddress(config: CliConfig): string {
  if (!config.address) {
    throw new ArgError(
      "No address configured. Set --address <addr> or ERGO_ADDRESS=<addr>."
    );
  }
  return config.address;
}
