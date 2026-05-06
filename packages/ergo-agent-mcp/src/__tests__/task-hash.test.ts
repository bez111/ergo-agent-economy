import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ergoTaskHash } from "../lifecycle-tools.js";

// Same shared vectors used by ergo-agent-pay and ergo-agent-cli — this test
// proves the MCP path stays in sync with the SDK and CLI.
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

function extractDigest(text: string): string {
  const match = text.match(/[0-9a-f]{64}/);
  if (!match) throw new Error(`no digest found in: ${text}`);
  return match[0];
}

describe("ergo_task_hash — golden vectors via the MCP handler", () => {
  it("matches every utf8 vector when called with 'text'", async () => {
    for (const v of file.cases.filter((c) => c.kind === "utf8")) {
      const result = await ergoTaskHash({ text: v.input });
      assert.equal(result.isError, undefined, `${v.name} unexpectedly errored`);
      assert.equal(extractDigest(result.content[0]!.text), v.expected_blake2b_256, v.name);
    }
  });

  it("matches every hex vector when called with 'hex'", async () => {
    for (const v of file.cases.filter((c) => c.kind === "hex")) {
      const result = await ergoTaskHash({ hex: v.input });
      assert.equal(result.isError, undefined, `${v.name} unexpectedly errored`);
      assert.equal(extractDigest(result.content[0]!.text), v.expected_blake2b_256, v.name);
    }
  });

  it("rejects calls with neither input", async () => {
    const result = await ergoTaskHash({});
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /exactly one of/);
  });

  it("rejects calls with both inputs", async () => {
    const result = await ergoTaskHash({ text: "abc", hex: "deadbeef" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /exactly one of/);
  });

  it("rejects malformed hex", async () => {
    const result = await ergoTaskHash({ hex: "zzzz" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /even-length hex/);
  });
});
