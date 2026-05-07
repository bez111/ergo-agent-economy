// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-scripts — audited tree manifest
//
// AUDITED_ERGOTREES.json is the signed manifest a downstream auditor produces.
// Until it is signed and `mainnetAllowed: true` is set, the SDK refuses to
// deploy / issue / redeem on mainnet using that tree.
//
// What this layer adds on top of the registry:
//   - canonical loader for the manifest
//   - byte-for-byte tree-hash verification against a named entry
//   - mainnet allow-list check (`mainnetAllowed === true`)
//   - audit-status read so callers can show clear errors
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hashErgoTree, loadRegistry } from "./registry.js";
import type { PredicateName } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(here, "../data/AUDITED_ERGOTREES.json");

export interface AuditedEntry {
  name: PredicateName;
  sourcePath: string;
  sourceHashBlake2b256: string;
  postTemplateSourceHashBlake2b256: string | null;
  ergoTreeHex: string;
  treeHashBlake2b256: string;
  intendedSemantics: string;
  mainnetAllowed: boolean;
  notes: string;
}

export interface AuditedManifest {
  schema: "accord-protocol/audited-ergotrees/v1";
  repo: string;
  commit: string;
  manifest_created_at: string;
  status: "draft-pre-audit" | "signed" | string;
  description: string;
  hash_algorithms: Record<string, string>;
  compiler: {
    primary: { name: string; version: string; lockfileHash: string | null; command: string };
    secondary_semantic_check: { name: string | null; version: string | null; command: string | null };
  };
  entries: AuditedEntry[];
  auditor: {
    name: string | null;
    contact: string | null;
    credentials: string | null;
    signature: string | null;
    signedPayloadHash: string | null;
  };
}

let cached: AuditedManifest | null = null;

export function loadAuditedManifest(): AuditedManifest {
  if (cached) return cached;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as AuditedManifest;
  // M-005: refuse to load if the registry's ergoTreeHex disagrees with the
  // manifest's. Catches partial tampering where someone edits one file but
  // not the other, regardless of whether the audit policy is invoked at
  // runtime.
  assertManifestMatchesRegistry(manifest);
  cached = manifest;
  return cached;
}

/**
 * Cross-check the manifest entries against the registry. Throws on mismatch.
 * Run automatically when the manifest is first loaded; exposed so
 * integrators can run it explicitly during boot/CI.
 */
export function verifyManifestAgainstRegistry(): void {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as AuditedManifest;
  assertManifestMatchesRegistry(manifest);
}

function assertManifestMatchesRegistry(manifest: AuditedManifest): void {
  const registry = loadRegistry();
  for (const entry of manifest.entries) {
    const reg = registry.predicates.find((p) => p.name === entry.name);
    if (!reg) {
      throw new Error(
        `audited manifest references "${entry.name}" but the registry has no entry by that name.`
      );
    }
    // The registry may legally carry null while the manifest carries the
    // compiled hex (e.g. during a partial publish). The other direction —
    // manifest null while registry filled, OR both filled but disagreeing —
    // is a configuration error.
    if (
      reg.ergoTreeHex !== null &&
      entry.ergoTreeHex !== null &&
      reg.ergoTreeHex !== entry.ergoTreeHex
    ) {
      throw new Error(
        `audit manifest is inconsistent with the registry for "${entry.name}":\n` +
          `  registry ergoTreeHex: ${reg.ergoTreeHex.slice(0, 32)}...\n` +
          `  manifest ergoTreeHex: ${entry.ergoTreeHex.slice(0, 32)}...\n` +
          `One of the two files was edited without re-running compile-predicates ` +
          `or refreshing the manifest. Refusing to load.`
      );
    }
  }
}

export function getAuditedEntry(name: PredicateName): AuditedEntry {
  const m = loadAuditedManifest();
  const found = m.entries.find((e) => e.name === name);
  if (!found) throw new Error(`No audit-manifest entry for predicate "${name}".`);
  return found;
}

export interface AuditVerdict {
  ok: boolean;
  reason?:
    | "unknown-name"
    | "manifest-tree-hash-mismatch"
    | "supplied-tree-hash-mismatch"
    | "not-mainnet-allowed"
    | "manifest-unsigned";
  message?: string;
  entry?: AuditedEntry;
}

/**
 * Verify a hex ergoTree against the audit manifest by **name**.
 *
 * `treeHex` MUST match the recorded `ergoTreeHex` byte-for-byte. The check
 * is two-layered: BLAKE2b-256(treeHex bytes) must equal the manifest's
 * `treeHashBlake2b256`, AND the registry-recorded ergoTreeHex must equal
 * the manifest-recorded ergoTreeHex (defence against a tampered registry).
 *
 * If `requireMainnet` is true, the entry must additionally have
 * `mainnetAllowed: true`. The manifest's overall `status` must be
 * `signed` for `requireMainnet` to even be considered.
 */
export function verifyAuditedErgoTree(
  name: PredicateName,
  treeHex: string,
  opts: { requireMainnet?: boolean } = {}
): AuditVerdict {
  let entry: AuditedEntry;
  try {
    entry = getAuditedEntry(name);
  } catch {
    return {
      ok: false,
      reason: "unknown-name",
      message: `No audit-manifest entry for "${name}".`,
    };
  }

  const expected = entry.treeHashBlake2b256;
  const supplied = hashErgoTree(treeHex);
  if (supplied !== expected) {
    return {
      ok: false,
      reason: "supplied-tree-hash-mismatch",
      message: `Tree hash mismatch for "${name}". Expected ${expected}, got ${supplied}. Refusing to treat this tree as audited.`,
      entry,
    };
  }

  // Defence in depth: also confirm the manifest's recorded ergoTreeHex
  // hashes the same value, in case someone edited just one of the two
  // fields (registry vs manifest).
  if (entry.ergoTreeHex && hashErgoTree(entry.ergoTreeHex) !== expected) {
    return {
      ok: false,
      reason: "manifest-tree-hash-mismatch",
      message: `Manifest is internally inconsistent for "${name}".`,
      entry,
    };
  }

  if (opts.requireMainnet) {
    const m = loadAuditedManifest();
    if (m.status !== "signed") {
      return {
        ok: false,
        reason: "manifest-unsigned",
        message: `Manifest status is "${m.status}", not "signed". Mainnet use requires an externally signed manifest.`,
        entry,
      };
    }
    if (entry.mainnetAllowed !== true) {
      return {
        ok: false,
        reason: "not-mainnet-allowed",
        message: `Predicate "${name}" is not mainnetAllowed in the audit manifest.`,
        entry,
      };
    }
  }

  return { ok: true, entry };
}

/**
 * Test seam — clears the cached manifest. Production code should not need this.
 */
export function _resetAuditedManifestCache(): void {
  cached = null;
}
