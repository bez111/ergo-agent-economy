/**
 * Example 05 — Agent Pays for API Call (Server Side)
 *
 * An HTTP server that charges per request in ERG Notes.
 * - POST /api/analyze  → requires a valid Note (passed as Bearer token / header)
 * - The server verifies the Note box on-chain before processing
 * - After processing, server builds + submits a redemption TX
 *
 * Flow:
 *   1. Client agent holds a Note (issued by themselves or a 3rd party)
 *   2. Agent calls POST /api/analyze with noteBoxId header
 *   3. Server fetches Note from blockchain, checks value + expiry
 *   4. Server processes the request
 *   5. Server redeems the Note to its own address
 *
 * This is a minimal Express server — production use would add:
 *   - Note signature verification (agent proves they hold the Note's key)
 *   - Rate limiting, replay protection (Tracker integration)
 *   - Actual signing (replace placeholder signer with real key)
 *
 * Run:
 *   npm install
 *   node server.js
 *
 * Then in another terminal: node client.js
 */

import express from "express";

const app = express();
app.use(express.json());

const TESTNET_API = "https://api-testnet.ergoplatform.com";
const SERVER_ADDRESS = "SERVER_TESTNET_ADDRESS";  // ← API server's address
const MIN_PAYMENT_NANOERG = 1_000_000n;           // 0.001 ERG minimum per request
const PORT = 3000;

// ── Note verification helper ──────────────────────────────────────────────────

async function verifyNote(noteBoxId) {
  // Fetch the Note box from blockchain
  let box;
  try {
    const res = await fetch(`${TESTNET_API}/api/v1/boxes/${noteBoxId}`);
    if (!res.ok) return { valid: false, error: "Note not found on chain" };
    box = await res.json();
  } catch {
    return { valid: false, error: "Network error fetching Note" };
  }

  // Get current block height
  const infoRes = await fetch(`${TESTNET_API}/api/v1/info`);
  const { fullHeight } = await infoRes.json();

  // Decode R5 (expiry block height) — SInt format: 04 prefix + zigzag
  const r5hex = box.additionalRegisters?.R5;
  let expiryBlock = 0;
  if (r5hex && r5hex.length >= 4) {
    const zigzag = parseInt(r5hex.slice(2), 16);
    expiryBlock = (zigzag >>> 1) ^ -(zigzag & 1);
  }

  if (expiryBlock > 0 && fullHeight >= expiryBlock) {
    return { valid: false, error: `Note expired at block ${expiryBlock}, current: ${fullHeight}` };
  }

  const noteValue = BigInt(box.value ?? 0);
  if (noteValue < MIN_PAYMENT_NANOERG) {
    return { valid: false, error: `Note value ${noteValue} nanoERG < minimum ${MIN_PAYMENT_NANOERG}` };
  }

  return { valid: true, box, noteValue, expiryBlock };
}

// ── API endpoint ──────────────────────────────────────────────────────────────

app.post("/api/analyze", async (req, res) => {
  const noteBoxId = req.headers["x-note-box-id"];

  if (!noteBoxId) {
    return res.status(402).json({
      error: "Payment required",
      message: "Provide a Note box ID in the X-Note-Box-Id header",
      minimumPayment: `${Number(MIN_PAYMENT_NANOERG) / 1e9} ERG`,
    });
  }

  // Verify the Note on-chain
  const { valid, error, box, noteValue } = await verifyNote(noteBoxId);
  if (!valid) {
    return res.status(402).json({ error: "Invalid Note", message: error });
  }

  console.log(`[server] Note verified: ${noteBoxId}`);
  console.log(`[server] Value: ${Number(noteValue) / 1e9} ERG`);

  // === Process the actual API request ===
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing 'text' field in request body" });
  }

  // (Placeholder analysis — replace with real ML/LLM call)
  const result = {
    sentiment: text.length % 2 === 0 ? "positive" : "neutral",
    wordCount: text.split(/\s+/).length,
    summary: `Processed ${text.length} characters`,
  };

  // === Redemption (server claims payment) ===
  // In production: build + sign + submit the redemption TX here using ErgoAgentPay
  // For this demo we just log the intent
  console.log(`[server] Redeeming Note ${noteBoxId} → ${SERVER_ADDRESS}`);
  console.log(`[server] (In production: buildRedeemNoteTx + submit)`);

  return res.json({
    success: true,
    result,
    payment: {
      noteBoxId,
      valueNanoErg: noteValue.toString(),
      valueErg: (Number(noteValue) / 1e9).toFixed(6),
    },
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ergo-agent-api-server",
    minimumPayment: `${Number(MIN_PAYMENT_NANOERG) / 1e9} ERG per request`,
    noteFormat: "Pass Note box ID in X-Note-Box-Id header",
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Ergo Agent API Server running on http://localhost:${PORT}`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/analyze`);
  console.log(`              Header: X-Note-Box-Id: <noteBoxId>`);
  console.log(`              Body:   { "text": "..." }`);
});
