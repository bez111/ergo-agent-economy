import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

import { taskHashCommand } from "../commands/task-hash.js";
import { parseArgs } from "../args.js";
import { resolveConfig } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(here, "../../../../test-vectors/task-hash.json");

interface Vector {
  name: string;
  input: string;
  kind: "utf8" | "hex";
  expected_blake2b_256: string;
}
interface VectorFile { cases: Vector[] }

const file = JSON.parse(readFileSync(vectorsPath, "utf-8")) as VectorFile;

// Capture process.stdout.write for the duration of one call.
async function capture(fn: () => Promise<void>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  let buf = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    buf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return buf;
}

describe("task-hash command — golden vectors via the CLI handler", () => {
  it("matches every utf8 vector when called with positional input", async () => {
    for (const v of file.cases.filter((c) => c.kind === "utf8")) {
      const args = parseArgs(["task-hash", v.input]);
      const config = resolveConfig(args);
      const out = await capture(() => taskHashCommand(args, config));
      assert.equal(out.trim(), v.expected_blake2b_256, `mismatch on ${v.name}`);
    }
  });

  it("matches every hex vector when called with --hex", async () => {
    for (const v of file.cases.filter((c) => c.kind === "hex")) {
      const args = parseArgs(["task-hash", "--hex", v.input]);
      const config = resolveConfig(args);
      const out = await capture(() => taskHashCommand(args, config));
      assert.equal(out.trim(), v.expected_blake2b_256, `mismatch on ${v.name}`);
    }
  });

  it("emits a JSON object when --json is set", async () => {
    const args = parseArgs(["task-hash", "abc", "--json"], { booleans: ["json"] });
    const config = resolveConfig(args);
    const out = await capture(() => taskHashCommand(args, config));
    const parsed = JSON.parse(out);
    assert.equal(parsed.task_hash, "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319");
    assert.equal(parsed.algorithm, "BLAKE2b-256");
    assert.equal(parsed.input_bytes, 3);
  });
});

describe("task-hash command — end-to-end via the bin entrypoint", () => {
  it("computes the right digest for stdin input", async () => {
    const cliEntry = resolve(here, "../index.ts");
    const tsx = resolve(here, "../../node_modules/.bin/tsx");
    const child = spawn(tsx, [cliEntry, "task-hash", "--stdin"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end("the answer is 42");

    let stdout = "";
    let stderr = "";
    for await (const chunk of child.stdout) stdout += chunk.toString();
    for await (const chunk of child.stderr) stderr += chunk.toString();
    const code = await new Promise<number>((res) => child.on("close", (c) => res(c ?? -1)));

    assert.equal(stderr, "", "expected empty stderr");
    assert.equal(code, 0, "expected exit code 0");
    assert.equal(
      stdout.trim(),
      "549ead194a83140a8b12bc38bb74ba7e5b094a5749ea73a7e04156f91cc5260a"
    );
  });
});
