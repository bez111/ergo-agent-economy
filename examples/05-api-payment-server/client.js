/**
 * Example 05 — Agent Pays for API Call (Client Side)
 *
 * An agent that:
 *   1. Holds a Note (or builds one from a mock box for demo purposes)
 *   2. Calls the API server with the Note as payment
 *   3. Receives the analysis result
 *
 * Run (after starting server.js):
 *   node client.js
 */

const SERVER_URL = "http://localhost:3000";

// ── Mock Note box ID (replace with real Note from issueNote) ──────────────────
// In a real flow:
//   const agent = new ErgoAgentPay({ address, network: "testnet", signer })
//   const { noteOutput } = await agent.issueNote({ recipient: ..., value: "0.005 ERG", ... })
//   const noteBoxId = noteOutput.boxId  // available after TX submission + confirmation
const MOCK_NOTE_BOX_ID = "a".repeat(64); // 64-char placeholder

// ── API call with Note payment ────────────────────────────────────────────────

async function analyzeWithPayment(text) {
  console.log(`[client] Calling /api/analyze with Note: ${MOCK_NOTE_BOX_ID.slice(0, 16)}...`);
  console.log(`[client] Text: "${text}"\n`);

  const res = await fetch(`${SERVER_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Note-Box-Id": MOCK_NOTE_BOX_ID,
    },
    body: JSON.stringify({ text }),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error(`[client] Request failed (${res.status}):`, body);
    return;
  }

  console.log("[client] Analysis result:");
  console.log("  Sentiment:", body.result.sentiment);
  console.log("  Word count:", body.result.wordCount);
  console.log("  Summary:", body.result.summary);
  console.log("\n[client] Payment confirmed:");
  console.log("  Note box ID:", body.payment.noteBoxId.slice(0, 16) + "...");
  console.log("  Amount:", body.payment.valueErg, "ERG");
}

// ── Health check ──────────────────────────────────────────────────────────────

async function healthCheck() {
  const res = await fetch(`${SERVER_URL}/health`);
  const body = await res.json();
  console.log("[client] Server health:", body.status);
  console.log("[client] Minimum payment:", body.minimumPayment);
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Ergo Agent API Payment Demo ===\n");

  await healthCheck();
  await analyzeWithPayment(
    "Q4 revenue exceeded expectations. Operating margin improved by 3.2 percentage points. " +
    "Customer acquisition costs declined 18% year-over-year. Guidance raised for FY2025."
  );
}

main().catch(console.error);
