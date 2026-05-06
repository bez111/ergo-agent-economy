#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// compile.mjs — populate ergoTreeHex / treeHashBlake2b256 in predicates.json
//
// Usage:
//   npm install --no-save @fleet-sdk/compiler @fleet-sdk/crypto
//   npm run compile-predicates
//
// Why @fleet-sdk/compiler and not ergo-lib-wasm-nodejs:
//   ergo-lib-wasm-nodejs ships only the runtime (parse / serialize ergoTrees).
//   The ErgoScript compiler is a separate Sigma.JS-backed package — much
//   smaller than the full Scala / sigmastate-jvm reference compiler, and the
//   only one available as plain npm without a JVM. We treat it as a peer
//   dependency so SDK consumers do not pay for it on install.
//
// Source loading
//   Every predicate has either:
//     - `source`     — inline ErgoScript (preferred for short snippets), or
//     - `sourceFile` — relative path under data/, e.g. "sources/reserve.es"
//   `sourceFile` wins if both are present.
//
// Chain-template substitution
//   ChainCash's note.es and receipt.es contain `$reserveContractHash` and
//   `$receiptContractHash` placeholders that must be filled with
//   base58(blake2b256(parentTree[1:])) — i.e., the hash of the parent
//   contract's ergoTree with the version byte stripped, exactly as the
//   ChainCash on-chain checks compute it. We resolve placeholders in
//   `dependsOn` order: parent compiled first, hash propagated, child
//   compiled with the substitution.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { blake2b } from "@noble/hashes/blake2b";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "../data");
const REGISTRY = resolve(DATA_DIR, "predicates.json");

async function loadCompiler() {
  try {
    return await import("@fleet-sdk/compiler");
  } catch {
    process.stderr.write(
      "error: @fleet-sdk/compiler is not installed.\n\n" +
        "Run:\n  npm install --no-save @fleet-sdk/compiler @fleet-sdk/crypto\n\n" +
        "Then re-run this script. @fleet-sdk/compiler and @fleet-sdk/crypto\n" +
        "are peer dependencies, intentionally not bundled with this package.\n"
    );
    process.exit(2);
  }
}

async function loadCrypto() {
  try {
    return await import("@fleet-sdk/crypto");
  } catch {
    process.stderr.write(
      "error: @fleet-sdk/crypto is not installed (needed for base58).\n" +
        "Run: npm install --no-save @fleet-sdk/crypto\n"
    );
    process.exit(2);
  }
}

async function loadPackageVersion(name) {
  try {
    const pkgPath = resolve(here, `../node_modules/${name}/package.json`);
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function blake2b256Hex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return toHex(blake2b(bytes, { dkLen: 32 }));
}

async function loadSource(entry) {
  if (entry.sourceFile) {
    return await readFile(resolve(DATA_DIR, entry.sourceFile), "utf-8");
  }
  if (typeof entry.source === "string") return entry.source;
  throw new Error(`predicate "${entry.name}" has neither source nor sourceFile`);
}

function applyTemplate(source, hashes) {
  let out = source;
  for (const [name, hashBase58] of Object.entries(hashes)) {
    const placeholder = `$${name}`;
    if (out.includes(placeholder)) {
      out = out.split(placeholder).join(hashBase58);
    }
  }
  return out;
}

/**
 * Compute base58(blake2b256(ergoTree[1:])) — the hash format ChainCash uses
 * to compare contract identities on-chain. The version byte is the first
 * byte of the ergoTree; ChainCash strips it via `tree.slice(1, tree.size)`.
 */
function computeContractHashBase58(ergoTreeHex, base58) {
  if (ergoTreeHex.length < 4) throw new Error("ergoTreeHex too short to strip version byte");
  const stripped = new Uint8Array((ergoTreeHex.length - 2) / 2);
  for (let i = 2, j = 0; i < ergoTreeHex.length; i += 2, j += 1) {
    stripped[j] = parseInt(ergoTreeHex.slice(i, i + 2), 16);
  }
  const hash = blake2b(stripped, { dkLen: 32 });
  return base58.encode(hash);
}

/** Topologically sort entries so dependencies are compiled before dependents. */
function sortByDependency(entries) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const visited = new Set();
  const order = [];
  const visit = (e) => {
    if (visited.has(e.name)) return;
    visited.add(e.name);
    for (const dep of e.dependsOn ?? []) {
      const next = byName.get(dep);
      if (!next) throw new Error(`predicate "${e.name}" depends on unknown "${dep}"`);
      visit(next);
    }
    order.push(e);
  };
  for (const e of entries) visit(e);
  return order;
}

async function main() {
  const compiler = await loadCompiler();
  const crypto = await loadCrypto();
  if (typeof compiler.compile !== "function") {
    process.stderr.write("error: @fleet-sdk/compiler has no compile() export — incompatible version.\n");
    process.exit(2);
  }
  if (!crypto.base58 || typeof crypto.base58.encode !== "function") {
    process.stderr.write("error: @fleet-sdk/crypto has no base58.encode export — incompatible version.\n");
    process.exit(2);
  }

  const text = await readFile(REGISTRY, "utf-8");
  const registry = JSON.parse(text);
  const compiledAt = new Date().toISOString();
  const compilerVersion = await loadPackageVersion("@fleet-sdk/compiler");
  const compilerLabel = `@fleet-sdk/compiler ${compilerVersion}`;

  const ordered = sortByDependency(registry.predicates);

  // Map of predicateName → base58(blake2b256(tree[1:])), filled as we compile.
  const contractHashes = {};

  for (const entry of ordered) {
    process.stderr.write(`compiling ${entry.name}...\n`);
    let source = await loadSource(entry);

    // Substitute any required chain-template placeholders.
    if (entry.dependsOn?.length) {
      const subs = {};
      for (const dep of entry.dependsOn) {
        const depHash = contractHashes[dep];
        if (!depHash) throw new Error(`missing hash for ${dep}; bad topo order?`);
        // ChainCash convention: placeholders are named <something>ContractHash;
        // we map dep → placeholder by stem-match.
        const tplVars = entry.templateVariables ?? {};
        for (const placeholder of Object.keys(tplVars)) {
          const stem = placeholder.replace(/ContractHash$/i, "").toLowerCase();
          if (dep.toLowerCase().includes(stem)) subs[placeholder] = depHash;
        }
      }
      source = applyTemplate(source, subs);
    }

    let tree;
    try {
      tree = compiler.compile(source);
    } catch (err) {
      process.stderr.write(`  failed: ${err && err.message ? err.message : err}\n`);
      process.exit(1);
    }
    const hex =
      typeof tree?.toHex === "function"
        ? tree.toHex()
        : tree?.bytes
        ? toHex(tree.bytes)
        : null;
    if (!hex) {
      process.stderr.write("  failed: compiler returned an unrecognised shape.\n");
      process.exit(1);
    }
    entry.ergoTreeHex = hex;
    entry.treeHashBlake2b256 = blake2b256Hex(hex);
    entry.compiledAt = compiledAt;
    entry.compiler = compilerLabel;
    contractHashes[entry.name] = computeContractHashBase58(hex, crypto.base58);
    process.stderr.write(
      `  ok — ${hex.length / 2} bytes, hash ${entry.treeHashBlake2b256.slice(0, 16)}...` +
        ` (chain-hash ${contractHashes[entry.name].slice(0, 12)}...)\n`
    );
  }

  await writeFile(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  process.stderr.write(`\nwrote ${REGISTRY}\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
});
