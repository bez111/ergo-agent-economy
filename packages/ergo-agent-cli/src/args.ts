// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-cli — argv parser
//
// Long-flag style: `--flag value`, `--flag=value`, `--bool` (sets to true).
// Bare positional arguments accumulate in `positional`. Flag values are
// strings; callers handle conversion. Boolean flags are detected by the schema
// passed to parseArgs — anything not declared as boolean takes the next argv
// token as its value.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArgSchema {
  /** Flag names that should be parsed as booleans (no following value). */
  booleans?: readonly string[];

  /** Flag names with single-character aliases, e.g. { h: "help" }. */
  aliases?: Readonly<Record<string, string>>;
}

export interface ParsedArgs {
  /** Subcommand path — every leading non-flag, non-aliased token. */
  positional: string[];

  /** Parsed flags. Boolean flags are present as `true`; value flags as strings. */
  flags: Record<string, string | boolean | undefined>;

  /** Anything after a literal `--`. Useful for forwarding. */
  rest: string[];
}

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

export function parseArgs(argv: readonly string[], schema: ArgSchema = {}): ParsedArgs {
  const booleans = new Set(schema.booleans ?? []);
  const aliases = schema.aliases ?? {};

  const positional: string[] = [];
  const flags: Record<string, string | boolean | undefined> = {};
  const rest: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;

    if (token === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
      const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);

      if (!name) throw new ArgError(`Empty flag name in "${token}"`);

      if (booleans.has(name)) {
        if (inlineValue !== undefined) {
          flags[name] = inlineValue !== "false" && inlineValue !== "0";
        } else {
          flags[name] = true;
        }
        i += 1;
        continue;
      }

      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
        i += 1;
        continue;
      }

      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new ArgError(`Flag --${name} requires a value`);
      }
      flags[name] = next;
      i += 2;
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      const short = token.slice(1);
      const expanded = aliases[short];
      if (!expanded) throw new ArgError(`Unknown short flag: -${short}`);

      if (booleans.has(expanded)) {
        flags[expanded] = true;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new ArgError(`Flag -${short} (--${expanded}) requires a value`);
      }
      flags[expanded] = next;
      i += 2;
      continue;
    }

    positional.push(token);
    i += 1;
  }

  return { positional, flags, rest };
}

/** Helper: pull a string flag, throwing with a clear message if absent. */
export function requireString(flags: ParsedArgs["flags"], name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new ArgError(`Missing required flag --${name}`);
  }
  return value;
}

/** Helper: optional string flag. */
export function optionalString(
  flags: ParsedArgs["flags"],
  name: string
): string | undefined {
  const value = flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ArgError(`Flag --${name} must be a string`);
  }
  return value;
}

/** Helper: boolean flag with default. */
export function optionalBoolean(
  flags: ParsedArgs["flags"],
  name: string
): boolean {
  return flags[name] === true;
}
