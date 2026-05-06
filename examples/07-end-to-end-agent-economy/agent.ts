// ─────────────────────────────────────────────────────────────────────────────
// 07 — Buyer agent (TypeScript)
//
// Issues a Note bound to the seller's expected task output, then calls the
// seller's API with the Note in the X-Note-Box-Id header. Uses Policy v2 to
// cap per-recipient spending and log every payment decision.
//
// Run:
//   BUYER_ADDRESS=9X... \
//   SELLER_ADDRESS=9Y... \
//   RESERVE_BOX_ID=abc... \
//   API_URL=http://localhost:3000 \
//   node agent.ts
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPay, computeTaskHash } from "ergo-agent-pay";
import type { AuditLogEvent } from "ergo-agent-pay";
import { tryGetErgoTree } from "ergo-agent-scripts";

const BUYER_ADDRESS = requireEnv("BUYER_ADDRESS");
const SELLER_ADDRESS = requireEnv("SELLER_ADDRESS");
const RESERVE_BOX_ID = requireEnv("RESERVE_BOX_ID");
const API_URL = process.env.API_URL ?? "http://localhost:3000";

const TASK_HASH_TREE = tryGetErgoTree("task_hash_v0");
if (!TASK_HASH_TREE) {
  throw new Error("ergo-agent-scripts has no compiled task_hash_v0 — re-run npm run compile-predicates.");
}

// ── Buyer SDK with policy v2 ────────────────────────────────────────────────

const audit = (event: AuditLogEvent) => {
  console.log(JSON.stringify({ side: "buyer", event }, replaceBigInts));
};

const buyer = new ErgoAgentPay({
  address: BUYER_ADDRESS,
  network: "testnet",
  signer: makeHttpSigner(process.env.EIP12_SIGNER_URL),
  policy: {
    perRecipientCap: { [SELLER_ADDRESS]: 100_000_000n },  // 0.1 ERG / payment to this seller
    dailyBudget: 1_000_000_000n,                          // 1 ERG / UTC day, all sellers
    auditLog: audit,
  },
});

// ── Issue a Note ─────────────────────────────────────────────────────────────
//
// The task output is what the SELLER will provide to redeem the Note —
// typically a deterministic transformation of the request body. Here we
// pre-commit to "the analysis result for this exact text".

const requestBody = { text: "the answer is 42" };
const expectedOutput = JSON.stringify({ sentiment: "neutral", word_count: 4 });
const taskHash = computeTaskHash(expectedOutput);

console.log("issuing Note...");
const issue = await buyer.issueNote({
  recipient: SELLER_ADDRESS,
  value: "0.001 ERG",
  reserveBoxId: RESERVE_BOX_ID,
  deadline: "+100 blocks",
  taskHash,
  scriptErgoTree: TASK_HASH_TREE,    // makes the predicate enforced on-chain
});

if (!issue.txId) {
  console.error("Note transaction was built but not submitted — set EIP12_SIGNER_URL.");
  process.exit(1);
}

const noteBoxId = predictNoteBoxId(issue.unsignedTx);
console.log(`issued: tx=${issue.txId} boxId=${noteBoxId}`);

// ── Call the API with the Note ──────────────────────────────────────────────

console.log(`calling ${API_URL}/api/analyze...`);
const response = await fetch(`${API_URL}/api/analyze`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Note-Box-Id": noteBoxId,
    "X-Task-Output": expectedOutput,
  },
  body: JSON.stringify(requestBody),
});

if (!response.ok) {
  const err = await response.text();
  console.error(`API rejected: ${response.status} ${response.statusText}\n${err}`);
  process.exit(1);
}

const body = await response.json();
console.log("paid request succeeded:", body);

// ── helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`environment variable ${name} is required`);
  return v;
}

function makeHttpSigner(url: string | undefined) {
  if (!url) return undefined;
  return async (unsignedTx: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: unsignedTx }),
    });
    if (!res.ok) throw new Error(`signer ${url} returned ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
}

/**
 * Compute the boxId of the issued Note.
 *
 * Real implementations should ask the wallet/signer for the boxId after
 * submission; the unsigned tx alone does not yet have one. Production code
 * watches the Ergo node for the confirming TX and reads the output's boxId
 * from there. Returning an obvious placeholder makes the demo fail loudly
 * if EIP12_SIGNER_URL is missing.
 */
function predictNoteBoxId(unsignedTx: Record<string, unknown>): string {
  void unsignedTx;
  return process.env.NOTE_BOX_ID ?? "REPLACE_WITH_REAL_BOX_ID_AFTER_SUBMISSION";
}

function replaceBigInts(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}
