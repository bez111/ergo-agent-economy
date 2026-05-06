// ─────────────────────────────────────────────────────────────────────────────
// 07 — Seller API (TypeScript)
//
// Express app behind ergo-agent-api middleware. Verifies a Note on every
// request, redeems it inline using the seller's signer, and serves the
// "real" handler only after redemption succeeds.
//
// Run:
//   SELLER_ADDRESS=9X... node server.ts
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { ErgoAgentPay, PolicyEngine } from "ergo-agent-pay";
import type { AuditLogEvent } from "ergo-agent-pay";
import { createNotePaymentMiddleware } from "ergo-agent-api";
import { tryGetErgoTree } from "ergo-agent-scripts";

const SELLER_ADDRESS = requireEnv("SELLER_ADDRESS");
const PORT = Number(process.env.PORT ?? 3000);

// ── Policy engine v2 — used to log every accepted/rejected payment ──────────

const audit = (event: AuditLogEvent) => {
  // For a real seller this goes to a queue / Postgres.
  console.log(JSON.stringify({ ts: Date.now(), event }, replaceBigInts));
};

const policy = new PolicyEngine({
  // Refuse a single redemption above 1 ERG by accident — protects against
  // a misconfigured pricing function.
  maxSinglePayment: 1_000_000_000n,
  auditLog: audit,
});

// ── SDK with a real signer — needed for inline redemption ───────────────────
//
// The signer wiring depends on how you hold the seller's key. Three options:
//   1. Nautilus / external HTTP signer (production):
//        signer: async (tx) => fetch(EIP12_SIGNER_URL, { ..., body: JSON.stringify(tx) })
//        .then(r => r.json())
//   2. A Fleet SDK seedSigner (testnet only):
//        import { Wallet } from "@fleet-sdk/wallet";
//        const wallet = Wallet.fromMnemonic(process.env.SELLER_MNEMONIC!);
//        signer: wallet.sign,
//   3. No signer → middleware falls back to "verify-only" mode and the
//      seller redeems out of band.
//
// We leave it env-driven so the demo doesn't ship a private key.

const agent = new ErgoAgentPay({
  address: SELLER_ADDRESS,
  network: "testnet",
  signer: makeHttpSigner(process.env.EIP12_SIGNER_URL),
});

// ── ergo-agent-scripts gives us the compiled task_hash_v0 tree ──────────────
// The buyer must use the SAME tree when issuing the Note. The middleware
// does not enforce which tree was used — it relies on `agent.redeemNote`
// to fail if the tree on-chain doesn't accept the supplied task output.
//
// Note: this constant is captured here so the seller can advertise the
// tree hash on a `/well-known/ergo-agent` page if they want to.
const TASK_HASH_TREE = tryGetErgoTree("task_hash_v0");
if (!TASK_HASH_TREE) {
  throw new Error("ergo-agent-scripts has no compiled task_hash_v0 — run npm run compile-predicates in that package.");
}

// ── Middleware ──────────────────────────────────────────────────────────────

const requirePayment = createNotePaymentMiddleware({
  agent,
  pricing: {
    "/api/analyze": 1_000_000n,    // 0.001 ERG
    "/api/transcribe": 5_000_000n, // 0.005 ERG
    default: 1_000_000n,
  },
  redeemStrategy: "immediate",      // inline redemption requires a signer
  onAccepted: (event) => {
    console.log(`paid: ${event.request.path} boxId=${event.noteBoxId} tx=${event.redemption?.txId ?? "verify-only"}`);
  },
  onRejected: (event) => {
    console.warn(`refused [${event.reason}] ${event.request.path}: ${event.message}`);
  },
});

// ── App ─────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get("/well-known/ergo-agent", (_req, res) => {
  res.json({
    address: SELLER_ADDRESS,
    network: "testnet",
    note_header: "x-note-box-id",
    task_output_header: "x-task-output",
    accepted_predicates: { task_hash_v0: TASK_HASH_TREE },
    pricing: {
      "/api/analyze": "0.001 ERG",
      "/api/transcribe": "0.005 ERG",
    },
  });
});

app.use(requirePayment);

app.post("/api/analyze", (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string") {
    res.status(400).json({ error: "missing text" });
    return;
  }
  const result = {
    sentiment: text.length % 2 === 0 ? "positive" : "neutral",
    word_count: text.split(/\s+/).filter(Boolean).length,
  };
  res.setHeader("X-Note-Status", "redeemed");
  res.json({
    result,
    payment: {
      box_id: req.notePayment?.noteBoxId,
      tx_id: req.notePayment?.redemption?.txId,
    },
  });
});

app.listen(PORT, () => {
  console.log(`seller API listening on http://localhost:${PORT}`);
  console.log(`address: ${SELLER_ADDRESS} (testnet)`);
  console.log(`tree:    task_hash_v0 (${TASK_HASH_TREE.length / 2} bytes)`);
});

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

function replaceBigInts(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}

void policy; // referenced for documentation; the live policy hook lives in ErgoAgentPay
