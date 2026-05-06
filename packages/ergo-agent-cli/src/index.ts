#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-cli — entrypoint
//
// Tiny dispatcher: parse argv, resolve config, route to a subcommand handler.
// Errors are reported on stderr with a non-zero exit code; stdout stays clean
// so it can be piped or captured.
// ─────────────────────────────────────────────────────────────────────────────

import { parseArgs, ArgError } from "./args.js";
import { resolveConfig } from "./config.js";
import { ROOT_HELP } from "./help.js";
import { fatal } from "./output.js";
import { ErgoAgentPayError } from "ergo-agent-pay";

import { balanceCommand } from "./commands/balance.js";
import { heightCommand } from "./commands/height.js";
import { noteCommand } from "./commands/note.js";
import { reserveCommand } from "./commands/reserve.js";
import { trackerCommand } from "./commands/tracker.js";
import { settleCommand } from "./commands/settle.js";
import { taskHashCommand } from "./commands/task-hash.js";

const VERSION = "0.1.0";

const SCHEMA = {
  booleans: ["json", "help", "version", "allow-insecure-dev-mode", "stdin"] as const,
  aliases: { h: "help" } as const,
};

export async function main(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv, SCHEMA);
  } catch (err) {
    if (err instanceof ArgError) {
      process.stderr.write(`error: ${err.message}\n\n${ROOT_HELP}`);
      return 2;
    }
    throw err;
  }

  if (parsed.flags["version"]) {
    process.stdout.write(`ergo-agent ${VERSION}\n`);
    return 0;
  }

  const command = parsed.positional[0];

  if (!command || parsed.flags["help"]) {
    process.stdout.write(ROOT_HELP);
    return command ? 0 : 0;
  }

  let config;
  try {
    config = resolveConfig(parsed);
  } catch (err) {
    if (err instanceof ArgError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  try {
    switch (command) {
      case "balance":
        await balanceCommand(parsed, config);
        return 0;
      case "height":
        await heightCommand(parsed, config);
        return 0;
      case "task-hash":
        await taskHashCommand(parsed, config);
        return 0;
      case "note":
        await noteCommand(parsed, config);
        return 0;
      case "reserve":
        await reserveCommand(parsed, config);
        return 0;
      case "tracker":
        await trackerCommand(parsed, config);
        return 0;
      case "settle":
        await settleCommand(parsed, config);
        return 0;
      default:
        process.stderr.write(`error: unknown command "${command}"\n\n${ROOT_HELP}`);
        return 2;
    }
  } catch (err) {
    if (err instanceof ArgError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    if (err instanceof ErgoAgentPayError) {
      process.stderr.write(`error [${err.code}]: ${err.message}\n`);
      return err.code === "INSECURE_MAINNET_MODE" ? 3 : 1;
    }
    if (err instanceof Error) {
      process.stderr.write(`error: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

// Detect being executed (vs imported by tests) and run.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`fatal: ${err instanceof Error ? err.message : err}\n`);
      process.exit(1);
    }
  );
}

// Re-export for tests / programmatic use.
export { fatal };
