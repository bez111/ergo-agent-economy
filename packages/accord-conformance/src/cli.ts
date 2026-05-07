#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// accord-conformance CLI
//
// Subcommands:
//   run        run the conformance suite (default — back-compat: no
//              subcommand argv falls through to `run`)
//   sign       sign a JSON file (conformance-result or audit manifest)
//   verify     verify a signed JSON file
//   keygen     generate a fresh ed25519 keypair
//
// Examples:
//   npx accord-conformance run --levels L0,L1,L2,L3,L4
//   npx accord-conformance run --levels L1 --target https://provider/api/run
//   npx accord-conformance run --levels L1 --target stdio:./build/server.js
//   npx accord-conformance keygen
//   npx accord-conformance sign --key 0x... result.json > signed.json
//   npx accord-conformance verify signed.json
//
// Exit codes:
//   0  every requested level passed (run) / signature valid (verify)
//   1  any fail/inconclusive (run) / signature invalid (verify)
//   2  CLI usage error
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { runConformance } from "./runner.js";
import {
  generateEd25519Keypair,
  signObject,
  verifySignature,
} from "./signing.js";
import type { ConformanceLevel, ConformanceResult } from "./types.js";

(async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  // No-subcommand back-compat: defaults to `run`.
  if (!sub || sub.startsWith("--") || sub === "-h") {
    return runCmd(argv);
  }
  if (sub === "run") return runCmd(argv.slice(1));
  if (sub === "sign") return signCmd(argv.slice(1));
  if (sub === "verify") return verifyCmd(argv.slice(1));
  if (sub === "keygen") return keygenCmd();
  if (sub === "help" || sub === "--help" || sub === "-h") {
    printUsage();
    process.exit(0);
  }
  usageExit(`unknown subcommand: ${sub}`);
})().catch((err: unknown) => {
  process.stderr.write(`accord-conformance crashed: ${(err as Error)?.message ?? String(err)}\n`);
  process.exit(1);
});

// ── run ──────────────────────────────────────────────────────────────────────

interface RunArgs {
  repoRoot: string;
  levels: ConformanceLevel[];
  json: boolean;
  targetUrl: string | undefined;
  targetStdio:
    | { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
    | undefined;
  agreementId: string | undefined;
  paymentJson: string | undefined;
}

function parseRunArgs(argv: string[]): RunArgs {
  const out: RunArgs = {
    repoRoot: process.cwd(),
    levels: ["L0"],
    json: false,
    targetUrl: undefined,
    targetStdio: undefined,
    agreementId: undefined,
    paymentJson: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo-root") {
      const v = argv[++i];
      if (!v) usageExit(`--repo-root requires a value`);
      out.repoRoot = path.resolve(v);
    } else if (a === "--levels") {
      const v = argv[++i];
      if (!v) usageExit(`--levels requires a comma-separated value (e.g. L0,L1)`);
      out.levels = v.split(",").map((s) => s.trim()).filter(Boolean) as ConformanceLevel[];
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--target") {
      const v = argv[++i];
      if (!v) usageExit(`--target requires a URL or stdio:<command>`);
      if (v.startsWith("stdio:")) {
        out.targetStdio = { command: v.slice("stdio:".length) };
      } else {
        out.targetUrl = v;
      }
    } else if (a === "--agreement-id") {
      const v = argv[++i];
      if (!v) usageExit(`--agreement-id requires a value`);
      out.agreementId = v;
    } else if (a === "--payment") {
      const v = argv[++i];
      if (!v) usageExit(`--payment requires a JSON string`);
      out.paymentJson = v;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else {
      usageExit(`unknown flag: ${a}`);
    }
  }
  if ((out.targetUrl || out.targetStdio) && !out.levels.includes("L1")) {
    usageExit(`--target only applies to L1; include L1 in --levels`);
  }
  if (out.targetUrl && out.targetStdio) {
    usageExit(`--target accepts either an HTTP URL OR stdio:<command>, not both`);
  }
  return out;
}

async function runCmd(argv: string[]): Promise<void> {
  const args = parseRunArgs(argv);
  const target = args.targetStdio
    ? `stdio:${args.targetStdio.command}`
    : args.targetUrl
      ? `network:${args.targetUrl}`
      : `local:${path.basename(args.repoRoot)}`;
  const result = await runConformance({
    repoRoot: args.repoRoot,
    levels: args.levels,
    target,
    targetUrl: args.targetUrl,
    targetStdio: args.targetStdio,
    agreementId: args.agreementId,
    paymentJson: args.paymentJson,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    emitText(result);
  }
  const allPassed = result.levels.every((l) => l.passed);
  process.exit(allPassed ? 0 : 1);
}

// ── sign ─────────────────────────────────────────────────────────────────────

async function signCmd(argv: string[]): Promise<void> {
  let inputPath: string | undefined;
  let key: string | undefined;
  let signer: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--key") key = argv[++i];
    else if (a === "--key-file") {
      const f = argv[++i];
      if (!f) usageExit(`--key-file requires a path`);
      key = fs.readFileSync(f, "utf-8").trim();
    } else if (a === "--signer") signer = argv[++i];
    else if (a === "--output" || a === "-o") output = argv[++i];
    else if (a && !a.startsWith("--")) inputPath = a;
    else usageExit(`unknown flag: ${a}`);
  }
  if (!inputPath) usageExit(`sign: input file required`);
  if (!key) usageExit(`sign: --key 0x<hex> or --key-file <path> required`);
  if (!key.startsWith("0x")) key = "0x" + key;

  const obj = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as Record<string, unknown>;
  const signed = signObject(obj, {
    privateKey: key as `0x${string}`,
    ...(signer ? { signer } : {}),
  });
  const out = JSON.stringify(signed, null, 2);
  if (output) {
    fs.writeFileSync(output, out + "\n");
    process.stderr.write(`✓ signed → ${output}\n`);
  } else {
    process.stdout.write(out + "\n");
  }
  process.exit(0);
}

// ── verify ───────────────────────────────────────────────────────────────────

async function verifyCmd(argv: string[]): Promise<void> {
  let inputPath: string | undefined;
  let expected: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--expected-key") expected = argv[++i];
    else if (a && !a.startsWith("--")) inputPath = a;
    else usageExit(`unknown flag: ${a}`);
  }
  if (!inputPath) usageExit(`verify: input file required`);
  if (expected && !expected.startsWith("0x")) expected = "0x" + expected;

  const obj = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as Record<string, unknown>;
  const r = verifySignature(obj, expected as `0x${string}` | undefined);
  if (r.ok) {
    const sig = obj.signature as { public_key?: string; signer?: string };
    process.stdout.write(
      `✓ valid ed25519 signature\n  public_key: ${sig.public_key ?? "?"}\n  signer:     ${sig.signer ?? "(unset)"}\n`,
    );
    process.exit(0);
  } else {
    process.stderr.write(`✗ ${r.code}: ${r.message}\n`);
    process.exit(1);
  }
}

// ── keygen ───────────────────────────────────────────────────────────────────

async function keygenCmd(): Promise<void> {
  const { privateKey, publicKey } = generateEd25519Keypair();
  process.stdout.write(`ed25519 keypair (KEEP THE PRIVATE KEY SECRET):\n\n`);
  process.stdout.write(`  private:  ${privateKey}\n`);
  process.stdout.write(`  public:   ${publicKey}\n\n`);
  process.stdout.write(
    `Use --key '${privateKey}' to sign; share '${publicKey}' so verifiers know it's you.\n`,
  );
  process.exit(0);
}

// ── help / output ────────────────────────────────────────────────────────────

function usageExit(reason: string): never {
  process.stderr.write(`accord-conformance: ${reason}\n\n`);
  printUsage();
  process.exit(2);
}

function printUsage(): void {
  process.stderr.write(
    [
      `Usage:`,
      `  accord-conformance run [--repo-root <dir>] [--levels L0,L1,L2,L3,L4] [--json]`,
      `  accord-conformance run --levels L1 --target <url> [--agreement-id <id>] [--payment <json>]`,
      `  accord-conformance run --levels L1 --target stdio:<command>`,
      `  accord-conformance keygen`,
      `  accord-conformance sign --key <0xhex> [--signer <id>] [--output <path>] <input.json>`,
      `  accord-conformance verify [--expected-key <0xhex>] <signed.json>`,
      ``,
      `Subcommands:`,
      `  run                          Run the conformance suite (default if no subcommand)`,
      `  sign                         Sign a JSON file (conformance-result or audit manifest)`,
      `  verify                       Verify a signed JSON file`,
      `  keygen                       Generate a fresh ed25519 keypair`,
      ``,
      `run flags:`,
      `  --repo-root <dir>            Repo containing schemas/ + test-vectors/ + registry/ (default: cwd)`,
      `  --levels L0,L1,L2,L3,L4      Levels to run (default: L0)`,
      `  --json                       Emit JSON ConformanceResult`,
      `  --target <url>               L1 — probe a live HTTP endpoint`,
      `  --target stdio:<command>     L1 — spawn an MCP server and probe its stdio JSON-RPC`,
      `  --agreement-id <id>          Optional — for the --target happy-path probe`,
      `  --payment <json>             Optional — rail-specific payment payload, JSON-encoded`,
      ``,
      `sign / verify flags:`,
      `  --key <0xhex>                Private key (hex, ed25519). 32 bytes.`,
      `  --key-file <path>            Read private key from a file instead of argv`,
      `  --signer <id>                Optional issuer label embedded in the signature`,
      `  --output <path>, -o <path>   Write signed JSON to file (default: stdout)`,
      `  --expected-key <0xhex>       verify: require the embedded public key match`,
      ``,
      `Levels:`,
      `  L0  Schema-compatible        — fixtures validate against schemas/v0`,
      `  L1  Transport-compatible     — Accord/402 + Accord/MCP roundtrip`,
      `  L2  Rail-compatible          — at least one rail adapter passes verifyPayment + settle`,
      `  L3  Security-compatible      — production-safety gates fire on mainnet writes`,
      `  L4  Registry-certified       — registry/ records validate + cross-resolve`,
      ``,
      `Exit codes: 0 success, 1 fail, 2 usage error.`,
      ``,
    ].join("\n"),
  );
}

function emitText(result: ConformanceResult): void {
  console.log(`Accord Conformance — ${result.target}`);
  console.log(`  ${result.started_at} → ${result.finished_at}`);
  console.log("");
  for (const lvl of result.levels) {
    const total = lvl.passed_count + lvl.failed_count + lvl.inconclusive_count;
    const status = lvl.passed
      ? "PASS"
      : lvl.failed_count > 0
        ? "FAIL"
        : "INCONCLUSIVE";
    console.log(
      `  ${lvl.level} ${status}  (${lvl.passed_count}/${total} pass, ${lvl.failed_count} fail, ${lvl.inconclusive_count} inconclusive)`,
    );
    for (const c of lvl.checks) {
      if (c.result === "pass") continue;
      console.log(`    ${c.result.toUpperCase().padEnd(13)} ${c.id}`);
      if (c.detail) {
        const lines = c.detail.split("\n");
        for (const line of lines) console.log(`                  ${line}`);
      }
    }
  }
  console.log("");
  console.log(
    `Achieved: ${result.achieved_level ?? "(none — fix L0 fails before claiming any badge)"}`,
  );
}
