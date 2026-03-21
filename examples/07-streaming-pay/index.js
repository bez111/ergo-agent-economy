/**
 * Example 07 — Streaming Micropayments (Pay-per-Token)
 *
 * An AI model server charges per output token.
 * Payment is a Note issued for the max budget.
 * At end of stream, server redeems only what was consumed.
 *
 * This is the Ergo solution to: "how do you pay for exactly 247 tokens
 * when you don't know in advance how many will be generated?"
 *
 * Architecture:
 *   Client issues Note for MAX_BUDGET (e.g. 0.001 ERG)
 *   Server generates tokens, tracking count
 *   Server redeems: consumed_tokens * PRICE_PER_TOKEN
 *   Server returns: MAX_BUDGET - consumed to client
 *
 * Run: node index.js
 */

import crypto from "node:crypto";

const PRICE_PER_TOKEN_NANOERG = 400n;     // 0.0000004 ERG per token
const MAX_BUDGET_NANOERG      = 1_000_000n; // 0.001 ERG credit

// Simulate streaming an LLM response
async function* streamLLMResponse(prompt) {
  const response = `Ergo is a resilient platform for contractual money. Based on ErgoScript,
it enables powerful DeFi applications and serves as the ideal base layer for autonomous
AI agent payment systems. The eUTXO model ensures deterministic execution — agents know
exactly what will happen before submitting a transaction. This is critical for autonomous
systems that cannot afford surprises.`;

  const words = response.split(" ");
  for (const word of words) {
    await new Promise(r => setTimeout(r, 10)); // simulate latency
    yield word + " ";
  }
}

class StreamingPaySession {
  constructor(noteBoxId, maxBudget, pricePerToken) {
    this.noteBoxId = noteBoxId;
    this.maxBudget = maxBudget;
    this.pricePerToken = pricePerToken;
    this.tokensConsumed = 0n;
    this.isOpen = false;
  }

  open() {
    this.isOpen = true;
    console.log(`[session] Opened. Credit: ${Number(this.maxBudget) / 1e9} ERG`);
    console.log(`[session] Price: ${this.pricePerToken} nanoERG/token\n`);
  }

  consume(tokens = 1n) {
    if (!this.isOpen) throw new Error("Session not open");
    const cost = tokens * this.pricePerToken;
    const totalSoFar = (this.tokensConsumed + tokens) * this.pricePerToken;
    if (totalSoFar > this.maxBudget) {
      throw new Error(`Budget exceeded: ${totalSoFar} > ${this.maxBudget}`);
    }
    this.tokensConsumed += tokens;
    return cost;
  }

  close() {
    this.isOpen = false;
    const charged = this.tokensConsumed * this.pricePerToken;
    const refund = this.maxBudget - charged;
    console.log(`\n[session] Closed.`);
    console.log(`[session] Tokens consumed: ${this.tokensConsumed}`);
    console.log(`[session] Charged: ${Number(charged) / 1e9} ERG`);
    console.log(`[session] Refund: ${Number(refund) / 1e9} ERG`);
    console.log(`[session] Note to redeem: ${this.noteBoxId.slice(0, 16)}...`);
    console.log(`\n[session] Redemption TX would:`);
    console.log(`  - Spend Note (${Number(this.maxBudget) / 1e9} ERG)`);
    console.log(`  - Output ${Number(charged) / 1e9} ERG → server`);
    console.log(`  - Output ${Number(refund) / 1e9} ERG → client (refund)`);
    return { charged, refund, tokensConsumed: this.tokensConsumed };
  }
}

async function main() {
  console.log("=== Streaming Micropayment Demo ===\n");

  const noteBoxId = crypto.randomBytes(32).toString("hex");
  const session = new StreamingPaySession(noteBoxId, MAX_BUDGET_NANOERG, PRICE_PER_TOKEN_NANOERG);

  session.open();

  console.log("Streaming response:");
  process.stdout.write("> ");

  let tokenCount = 0;
  for await (const chunk of streamLLMResponse("What is Ergo?")) {
    process.stdout.write(chunk);
    session.consume(1n); // 1 token per word (simplified)
    tokenCount++;
  }

  const result = session.close();
  console.log(`\n\nEfficiency: ${(Number(result.charged) / Number(MAX_BUDGET_NANOERG) * 100).toFixed(1)}% of budget used`);
  console.log(`Cost if paid upfront at max: ${Number(MAX_BUDGET_NANOERG) / 1e9} ERG`);
  console.log(`Actual cost with streaming:  ${Number(result.charged) / 1e9} ERG`);
}

main().catch(console.error);
