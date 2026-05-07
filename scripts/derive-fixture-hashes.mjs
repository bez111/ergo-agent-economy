#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/derive-fixture-hashes.mjs
//
// For every <name>.json under test-vectors/{agreement,verification-receipt,
// settlement-receipt}/v0/ that does NOT start with `invalid-`, derive:
//
//   <name>.canonical.txt — the canonical-JSON bytes as a single line
//   <name>.hash.txt      — accord_hash_v0 (lower-case 64-hex, no 0x prefix)
//
// These pinned files are the cross-language test vectors. The TS conformance
// tests in @accord-protocol/core load them and assert canonicalize() +
// accordHashV0() reproduce the same outputs. Future Python / Go / Rust
// implementations will load the same files and assert the same outputs.
//
// Usage:
//   node scripts/derive-fixture-hashes.mjs           # rewrite all fixtures
//   node scripts/derive-fixture-hashes.mjs --check   # exit 1 if any drift
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { canonicalize, accordHashV0 } from "@accord-protocol/core";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const VECTOR_ROOT = path.join(REPO_ROOT, "test-vectors");
const FAMILIES = [
  "agreement/v0",
  "verification-receipt/v0",
  "settlement-receipt/v0",
];

const checkOnly = process.argv.includes("--check");
let drift = 0;
let pinned = 0;

for (const family of FAMILIES) {
  const dir = path.join(VECTOR_ROOT, family);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    if (f.startsWith("invalid-")) continue;
    const name = f.replace(/\.json$/, "");
    const jsonPath = path.join(dir, f);
    const canonicalPath = path.join(dir, `${name}.canonical.txt`);
    const hashPath = path.join(dir, `${name}.hash.txt`);

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    delete data._comment;

    const canonical = canonicalize(data) + "\n";
    const hash = accordHashV0(data) + "\n";

    if (checkOnly) {
      const beforeC = fs.existsSync(canonicalPath)
        ? fs.readFileSync(canonicalPath, "utf-8")
        : "";
      const beforeH = fs.existsSync(hashPath)
        ? fs.readFileSync(hashPath, "utf-8")
        : "";
      if (beforeC !== canonical) {
        console.error(`✗ ${family}/${name}: canonical bytes drifted`);
        drift++;
      }
      if (beforeH !== hash) {
        console.error(`✗ ${family}/${name}: hash drifted`);
        drift++;
      }
    } else {
      fs.writeFileSync(canonicalPath, canonical);
      fs.writeFileSync(hashPath, hash);
      console.log(`✓ ${family}/${name}  →  ${hash.trim()}`);
    }
    pinned++;
  }
}

if (checkOnly) {
  console.log(`\nchecked ${pinned} fixture(s); ${drift} drift(s) found`);
  process.exit(drift === 0 ? 0 : 1);
}
console.log(`\npinned ${pinned} fixture(s)`);
