// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-scripts — registry loader
//
// Loads the static JSON registry, exposes typed lookup, and offers a small
// hash-verification helper so a host can confirm that an externally-supplied
// ergoTree matches the source (defence against accidentally pasting the
// wrong tree).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { blake2b } from "@noble/hashes/blake2b";
import type { PredicateEntry, PredicateName, PredicateRegistry } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist sits next to data/ once tsup runs; src tests run with tsx and resolve relative to src.
const REGISTRY_PATH = resolve(here, "../data/predicates.json");

let cached: PredicateRegistry | null = null;

export function loadRegistry(): PredicateRegistry {
  if (cached) return cached;
  const text = readFileSync(REGISTRY_PATH, "utf-8");
  const registry = JSON.parse(text) as PredicateRegistry;

  // Resolve `sourceFile` → `source` so callers can rely on `source` always
  // being a string when present. The file lives under data/ next to
  // predicates.json.
  const dataDir = dirname(REGISTRY_PATH);
  for (const entry of registry.predicates) {
    if (entry.sourceFile && !entry.source) {
      entry.source = readFileSync(resolve(dataDir, entry.sourceFile), "utf-8");
    }
  }

  cached = registry;
  return cached;
}

/** Look up a predicate by name. Throws if the name is unknown. */
export function getPredicate(name: PredicateName): PredicateEntry {
  const registry = loadRegistry();
  const found = registry.predicates.find((p) => p.name === name);
  if (!found) {
    throw new Error(`Unknown predicate "${name}". Known: ${registry.predicates.map((p) => p.name).join(", ")}.`);
  }
  return found;
}

/**
 * Returns the compiled ErgoTree hex, or null if the registry entry has not
 * been populated yet. Callers should branch and either pass it as the
 * `scriptErgoTree` to ergo-agent-pay, or compile themselves.
 */
export function tryGetErgoTree(name: PredicateName): string | null {
  return getPredicate(name).ergoTreeHex;
}

/**
 * Compute BLAKE2b-256 of the hex-decoded ErgoTree.
 *
 * Used for two things:
 *   1. Filling `treeHashBlake2b256` after compilation.
 *   2. Quick equality check between an externally-supplied tree and the
 *      compiled artefact in the registry.
 */
export function hashErgoTree(hex: string): string {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("hashErgoTree expects an even-length hex string.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  const digest = blake2b(bytes, { dkLen: 32 });
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies that `treeHex` matches the hash recorded for `name`.
 *
 * Returns `{ ok: true }` when the registry has a recorded hash and it
 * matches; `{ ok: false, reason }` otherwise. When the registry has no
 * recorded hash (i.e. the tree has not been compiled yet) returns
 * `{ ok: false, reason: "no recorded hash" }` so callers do not silently
 * accept arbitrary trees as canonical.
 */
export function verifyErgoTree(
  name: PredicateName,
  treeHex: string
): { ok: true } | { ok: false; reason: string } {
  const entry = getPredicate(name);
  if (!entry.treeHashBlake2b256) {
    return { ok: false, reason: "no recorded hash for this predicate yet — populate via `npm run compile-predicates`" };
  }
  const actual = hashErgoTree(treeHex);
  if (actual !== entry.treeHashBlake2b256) {
    return {
      ok: false,
      reason: `tree hash mismatch — expected ${entry.treeHashBlake2b256}, got ${actual}`,
    };
  }
  return { ok: true };
}

/** Test seam: clear the cached registry so reloads pick up changes. */
export function _resetRegistryCache(): void {
  cached = null;
}
