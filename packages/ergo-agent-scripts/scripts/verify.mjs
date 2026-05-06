#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify.mjs — sanity-check predicates.json
//
// Runs without ergo-lib-wasm. Verifies that for every populated entry the
// recorded `treeHashBlake2b256` matches `blake2b256(ergoTreeHex bytes)`.
// Useful in CI to catch a hand-edited registry where someone changed the
// tree without updating the hash.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { blake2b } from "@noble/hashes/blake2b";

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(here, "../data/predicates.json");

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return toHex(blake2b(bytes, { dkLen: 32 }));
}

const registry = JSON.parse(await readFile(REGISTRY, "utf-8"));
let problems = 0;
let unfilled = 0;

for (const entry of registry.predicates) {
  if (entry.ergoTreeHex == null) {
    unfilled += 1;
    process.stdout.write(`unfilled: ${entry.name}\n`);
    continue;
  }
  if (!/^[0-9a-fA-F]+$/.test(entry.ergoTreeHex) || entry.ergoTreeHex.length % 2 !== 0) {
    problems += 1;
    process.stderr.write(`malformed hex: ${entry.name}\n`);
    continue;
  }
  if (!entry.treeHashBlake2b256) {
    problems += 1;
    process.stderr.write(`missing treeHashBlake2b256: ${entry.name}\n`);
    continue;
  }
  const actual = hashHex(entry.ergoTreeHex);
  if (actual !== entry.treeHashBlake2b256) {
    problems += 1;
    process.stderr.write(
      `hash mismatch: ${entry.name}\n  expected: ${entry.treeHashBlake2b256}\n  actual:   ${actual}\n`
    );
    continue;
  }
  process.stdout.write(`ok: ${entry.name} (${entry.ergoTreeHex.length / 2} bytes)\n`);
}

if (problems > 0) {
  process.stderr.write(`\n${problems} problem(s) found.\n`);
  process.exit(1);
}
if (unfilled > 0) {
  process.stdout.write(
    `\n${unfilled} predicate(s) unfilled — run 'npm run compile-predicates'.\n`
  );
}
