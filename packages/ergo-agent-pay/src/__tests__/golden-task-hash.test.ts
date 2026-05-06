import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computeTaskHash, computeTaskHashAsync } from "../predicates.js";

// Locate the shared cross-language vectors file.
const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(here, "../../../../test-vectors/task-hash.json");

interface Vector {
  name: string;
  input: string;
  kind: "utf8" | "hex";
  expected_blake2b_256: string;
}

interface VectorFile {
  algorithm: string;
  digest_size_bytes: number;
  cases: Vector[];
}

const file = JSON.parse(readFileSync(vectorsPath, "utf-8")) as VectorFile;

function decode(v: Vector): Uint8Array {
  if (v.kind === "utf8") return new TextEncoder().encode(v.input);
  const m = v.input.match(/.{2}/g) ?? [];
  return Uint8Array.from(m.map((b) => parseInt(b, 16)));
}

describe("computeTaskHash — golden vectors (BLAKE2b-256)", () => {
  it("vector file declares BLAKE2b-256 with 32-byte digest", () => {
    assert.equal(file.algorithm, "BLAKE2b-256");
    assert.equal(file.digest_size_bytes, 32);
  });

  for (const v of file.cases) {
    it(`matches: ${v.name}`, () => {
      const bytes = decode(v);
      assert.equal(computeTaskHash(bytes), v.expected_blake2b_256);
    });
  }

  it("UTF-8 string input matches the byte-array path", () => {
    const utfCases = file.cases.filter((c) => c.kind === "utf8");
    for (const v of utfCases) {
      assert.equal(
        computeTaskHash(v.input),
        v.expected_blake2b_256,
        `string-input mismatch on ${v.name}`
      );
    }
  });

  it("computeTaskHashAsync returns the same digest", async () => {
    for (const v of file.cases) {
      const bytes = decode(v);
      assert.equal(await computeTaskHashAsync(bytes), v.expected_blake2b_256);
    }
  });
});
