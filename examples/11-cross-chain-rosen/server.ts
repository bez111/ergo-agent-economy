// ─────────────────────────────────────────────────────────────────────────────
// 11 — Seller API accepting Rosen-bridged stablecoin payments
//
// Same architecture as example 07, but Notes are denominated in rsUSDT
// (Rosen-bridged USDT-on-Ethereum) using the manifest-gated
// `basis_token_reserve_v0` ergoTree.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import express from "express";
import { ErgoAgentPay } from "ergo-agent-pay";
import { createNotePaymentMiddleware } from "ergo-agent-api";
import { TokenMap } from "@rosen-bridge/tokens";
import { resolveErgoSideToken } from "ergo-agent-rosen";
import { verifyAuditedErgoTree } from "ergo-agent-scripts";

const SELLER_ADDRESS = requireEnv("SELLER_ADDRESS");
const ROSEN_TOKEN_MAP_PATH = requireEnv("ROSEN_TOKEN_MAP_PATH");
const PORT = Number(process.env.PORT ?? 3000);

const tokenMap = new TokenMap();
await tokenMap.updateConfigByJson(JSON.parse(await readFile(ROSEN_TOKEN_MAP_PATH, "utf-8")));

const usdt = resolveErgoSideToken(tokenMap, { chain: "ethereum", name: "USDT" });
console.log(`accepting rsUSDT (tokenId: ${usdt.ergoTokenId.slice(0, 16)}…, decimals: ${usdt.wrappedDecimals})`);

const agent = new ErgoAgentPay({
  address: SELLER_ADDRESS,
  network: "testnet",
  signer: makeHttpSigner(process.env.EIP12_SIGNER_URL),
  auditPolicy: (tree, name) => {
    if (!name) return { ok: false as const, reason: "scriptName required" };
    const v = verifyAuditedErgoTree(name as Parameters<typeof verifyAuditedErgoTree>[0], tree);
    return v.ok ? { ok: true as const } : { ok: false as const, reason: v.message ?? "unaudited" };
  },
});

const requirePayment = createNotePaymentMiddleware({
  agent,
  pricing: { "/api/analyze": 1_000_000n, default: 1_000_000n },     // 1 rsUSDT (6 decimals)
  redeemStrategy: "immediate",
  onAccepted: (event) => {
    console.log(`paid: ${event.request.path} boxId=${event.noteBoxId} tx=${event.redemption?.txId ?? "verify-only"}`);
  },
  onRejected: (event) => {
    console.warn(`refused [${event.reason}] ${event.request.path}: ${event.message}`);
  },
});

const app = express();
app.use(express.json());

app.get("/well-known/ergo-agent", (_req, res) => {
  res.json({
    address: SELLER_ADDRESS,
    network: "testnet",
    accepted_token: { name: "rsUSDT", ergoTokenId: usdt.ergoTokenId, decimals: usdt.wrappedDecimals },
    pricing: { "/api/analyze": "1.000000 USDT" },
  });
});

app.use(requirePayment);

app.post("/api/analyze", (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string") {
    res.status(400).json({ error: "missing text" });
    return;
  }
  res.json({
    result: { word_count: text.split(/\s+/).filter(Boolean).length },
    payment: { box_id: req.notePayment?.noteBoxId, tx_id: req.notePayment?.redemption?.txId },
  });
});

app.listen(PORT, () => {
  console.log(`seller listening on http://localhost:${PORT}`);
});

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
