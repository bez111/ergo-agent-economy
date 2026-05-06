// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-cli — output helpers
//
// Two modes: human (default — prints labelled fields to stdout, errors to
// stderr) and machine (`--json` — single JSON object to stdout). Both modes
// keep status messages on stderr so downstream tools can pipe stdout safely.
// ─────────────────────────────────────────────────────────────────────────────

export interface OutputOptions {
  json: boolean;
}

const indent = "  ";

export function emit(opts: OutputOptions, payload: unknown, fields?: ReadonlyArray<readonly [string, string | undefined]>): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(payload, bigintReplacer, 2) + "\n");
    return;
  }

  if (fields && fields.length > 0) {
    const width = Math.max(...fields.map((f) => f[0].length));
    for (const [label, value] of fields) {
      if (value === undefined) continue;
      process.stdout.write(`${label.padEnd(width)}${indent}${value}\n`);
    }
    return;
  }

  process.stdout.write(JSON.stringify(payload, bigintReplacer, 2) + "\n");
}

export function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`! ${message}\n`);
}

export function fatal(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function formatNanoErgs(nanoErgs: bigint): string {
  const negative = nanoErgs < 0n;
  const abs = negative ? -nanoErgs : nanoErgs;
  const erg = abs / 1_000_000_000n;
  const frac = abs % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${erg}.${fracStr}` : erg.toString();
  return `${negative ? "-" : ""}${body} ERG`;
}
