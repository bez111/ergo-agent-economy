// ─────────────────────────────────────────────────────────────────────────────
// 11 — Buyer agent paying in rsUSDT
//
// Step 1: discover the seller's accepted token at /well-known/ergo-agent.
// Step 2: ensure the buyer has rsUSDT on Ergo. If not, print a Rosen
//         bridge URL — the buyer signs in MetaMask, waits ~30 min, and
//         re-runs.
// Step 3: create a Reserve in rsUSDT (one-time per buyer).
// Step 4: issue a Note for the API price, send the request.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { ErgoAgentPay, computeTaskHash } from "ergo-agent-pay";
import { TokenMap } from "@rosen-bridge/tokens";
import {
  resolveErgoSideToken,
  bridgeUrl,
  buildRosenReserveConfig,
  buildRosenNoteOptions,
} from "ergo-agent-rosen";
import { verifyAuditedErgoTree } from "ergo-agent-scripts";

const BUYER_ADDRESS = requireEnv("BUYER_ADDRESS");
const ROSEN_TOKEN_MAP_PATH = requireEnv("ROSEN_TOKEN_MAP_PATH");
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const RESERVE_BOX_ID = process.env.RESERVE_BOX_ID;
const SUPPLIED_NOTE_BOX_ID = process.env.NOTE_BOX_ID;

const tokenMap = new TokenMap();
await tokenMap.updateConfigByJson(JSON.parse(await readFile(ROSEN_TOKEN_MAP_PATH, "utf-8")));

const usdt = resolveErgoSideToken(tokenMap, { chain: "ethereum", name: "USDT" });
console.log(`buyer paying in rsUSDT (tokenId: ${usdt.ergoTokenId.slice(0, 16)}…)`);

// Step 2: bridge guidance
if (!RESERVE_BOX_ID) {
  const url = bridgeUrl({
    from: "ethereum",
    to: "ergo",
    asset: "USDT",
    amount: "10",
    recipient: BUYER_ADDRESS,
  });
  console.log("\n→ One-time bridge step: open this URL in your browser, sign with MetaMask:");
  console.log("  ", url);
  console.log("\n  (after ~30 min, rsUSDT will appear at your Ergo address; rerun with RESERVE_BOX_ID set after creating a Reserve)");
  process.exit(0);
}

// Step 3: SDK with audit policy
const agent = new ErgoAgentPay({
  address: BUYER_ADDRESS,
  network: "testnet",
  signer: makeHttpSigner(process.env.EIP12_SIGNER_URL),
  auditPolicy: (tree, name) => {
    if (!name) return { ok: false as const, reason: "scriptName required" };
    const v = verifyAuditedErgoTree(name as Parameters<typeof verifyAuditedErgoTree>[0], tree);
    return v.ok ? { ok: true as const } : { ok: false as const, reason: v.message ?? "unaudited" };
  },
});

// Step 4: issue a Note, unless the caller is resuming with a known Note box id.
const expectedOutput = JSON.stringify({ word_count: 4 });
const taskHash = computeTaskHash(expectedOutput);

const noteOpts = buildRosenNoteOptions({
  token: usdt,
  recipient: requireEnv("SELLER_ADDRESS"),
  amount: 1_000_000n, // 1 rsUSDT
  reserveBoxId: RESERVE_BOX_ID,
  deadline: "+100 blocks",
  taskHash,
});

let noteBoxId = SUPPLIED_NOTE_BOX_ID;
if (noteBoxId) {
  console.log(`using supplied note boxId=${noteBoxId}`);
} else {
  const issued = await agent.issueNote(noteOpts);
  if (!issued.submitted || !issued.txId) {
    console.log("issueNote built an unsigned transaction. Sign and submit it, then rerun with NOTE_BOX_ID=<resolved box id>.");
    console.log(JSON.stringify(issued.unsignedTx, null, 2));
    process.exit(0);
  }

  noteBoxId = issued.noteBoxId;
  if (!noteBoxId) {
    console.log(`issued note tx=${issued.txId}`);
    console.log(
      `signer did not return output box ids; resolve output index ${issued.noteOutputIndex} ` +
        "from your testnet node/explorer, then rerun with NOTE_BOX_ID=<resolved box id>.",
    );
    process.exit(0);
  }
  console.log(`issued note tx=${issued.txId} boxId=${noteBoxId}`);
}

// Step 5: call the API
const response = await fetch(`${API_URL}/api/analyze`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Note-Box-Id": noteBoxId,
    "X-Task-Output": expectedOutput,
  },
  body: JSON.stringify({ text: "the answer is 42" }),
});
console.log(`server response: ${response.status}`);
console.log(await response.text());

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

void buildRosenReserveConfig; // referenced for the README example; not used in this short flow
