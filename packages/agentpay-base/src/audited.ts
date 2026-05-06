// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — audit manifest loader & verifier
//
// Mirrors `ergo-agent-scripts/audited.ts`. The manifest commits to:
//   * a network (`base` or `base-sepolia`)
//   * a deployed contract address
//   * the keccak256 of the runtime bytecode at that address
//   * a `mainnetAllowed` flag — only `true` after an external auditor signs.
//
// At runtime, `verifyAuditedContract` fetches the runtime bytecode from the
// chain, hashes it, and compares against the manifest. A mismatch means
// either the manifest is stale or the deployment was tampered with — both
// disqualifying.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Address, Hex, PublicClient } from "viem";
import type { BaseNetwork } from "./types.js";
import { fetchBytecodeHash } from "./safety.js";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(here, "../data/AUDITED_CONTRACTS.json");

export interface AuditedContractEntry {
  name: string;
  network: BaseNetwork;
  address: Address;
  /** keccak256 of the runtime bytecode at `address`. */
  bytecodeHashKeccak256: Hex;
  /** Source location (path, commit) the auditor reviewed. */
  sourcePath: string;
  /** Free-form notes (auditor-supplied). */
  notes: string;
  /** Mainnet promotion flag. */
  mainnetAllowed: boolean;
  /** ISO-8601 timestamp the auditor signed. */
  signedAt: string | null;
  /** Auditor signature payload (PGP/minisign/etc.). */
  signature: string | null;
}

export interface AuditedContractsManifest {
  schema: "ergo-agent-economy/audited-contracts/v1";
  repo: string;
  package: "agentpay-base";
  manifest_created_at: string;
  status: "draft-pre-audit" | "signed" | string;
  description: string;
  hash_algorithm: string;
  entries: AuditedContractEntry[];
}

let cached: AuditedContractsManifest | null = null;

export function loadAuditedContracts(): AuditedContractsManifest {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as AuditedContractsManifest;
  return cached;
}

export function getAuditedContract(
  network: BaseNetwork,
  address: Address
): AuditedContractEntry | null {
  const m = loadAuditedContracts();
  return (
    m.entries.find(
      (e) =>
        e.network === network &&
        e.address.toLowerCase() === address.toLowerCase()
    ) ?? null
  );
}

export interface VerifyVerdict {
  ok: boolean;
  reason?:
    | "no-manifest-entry"
    | "bytecode-hash-mismatch"
    | "manifest-unsigned"
    | "not-mainnet-allowed"
    | "no-bytecode";
  message?: string;
  entry?: AuditedContractEntry;
}

/**
 * Two-layer verification:
 *   1. Manifest entry exists for (network, address).
 *   2. keccak256(runtime bytecode at `address`) equals the manifest's hash.
 *
 * When `requireMainnet` is true, additionally requires the manifest's
 * `status === "signed"` AND the entry's `mainnetAllowed === true`.
 */
export async function verifyAuditedContract(args: {
  client: PublicClient;
  network: BaseNetwork;
  address: Address;
  requireMainnet?: boolean;
}): Promise<VerifyVerdict> {
  const entry = getAuditedContract(args.network, args.address);
  if (!entry) {
    return {
      ok: false,
      reason: "no-manifest-entry",
      message: `No audit-manifest entry for contract ${args.address} on ${args.network}.`,
    };
  }

  let onChainHash: Hex;
  try {
    onChainHash = await fetchBytecodeHash(args.client, args.address);
  } catch (err) {
    return {
      ok: false,
      reason: "no-bytecode",
      message: err instanceof Error ? err.message : String(err),
      entry,
    };
  }
  if (onChainHash !== entry.bytecodeHashKeccak256) {
    return {
      ok: false,
      reason: "bytecode-hash-mismatch",
      message:
        `Bytecode hash mismatch for ${args.address} on ${args.network}. ` +
        `Manifest: ${entry.bytecodeHashKeccak256}. On-chain: ${onChainHash}. ` +
        `Refusing to treat this contract as audited.`,
      entry,
    };
  }

  if (args.requireMainnet) {
    const m = loadAuditedContracts();
    if (m.status !== "signed") {
      return {
        ok: false,
        reason: "manifest-unsigned",
        message: `Manifest status is "${m.status}", not "signed".`,
        entry,
      };
    }
    if (!entry.mainnetAllowed) {
      return {
        ok: false,
        reason: "not-mainnet-allowed",
        message: `Contract ${args.address} is not mainnetAllowed in the audit manifest.`,
        entry,
      };
    }
  }

  return { ok: true, entry };
}

/** Test seam — clears the cached manifest. */
export function _resetAuditedContractsCache(): void {
  cached = null;
}
