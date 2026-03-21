/**
 * Example 08 — Multi-Agent Treasury (Sigma Threshold)
 *
 * A treasury controlled by 3 agents, requiring 2-of-3 signatures.
 * No central authority. No smart contract deploy. Pure ErgoScript.
 *
 * Use case: An AI orchestration system where:
 *   - 3 specialized agents share a treasury
 *   - Any payment > threshold requires 2 agents to agree
 *   - Prevents any single agent from draining the fund
 *
 * ErgoScript guard:
 *   atLeast(2, Coll(PK("agent_A_key"), PK("agent_B_key"), PK("agent_C_key")))
 *
 * Run: node index.js
 */

// Mock agent public keys (32-byte hex — in production use real GroupElement compressed keys)
const AGENTS = [
  { name: "research-agent",   pubkey: "02" + "a".repeat(62) },
  { name: "analysis-agent",   pubkey: "02" + "b".repeat(62) },
  { name: "execution-agent",  pubkey: "02" + "c".repeat(62) },
];

const THRESHOLD = 2; // 2-of-3 required
const TREASURY_BALANCE = 10_000_000n; // 0.01 ERG

// Build the Sigma threshold ErgoScript
function buildTreasuryScript(threshold, agents) {
  const pks = agents.map(a => `PK("${a.pubkey}")`).join(", ");
  return `atLeast(${threshold}, Coll(${pks}))`;
}

// Simulate a spend proposal + approval flow
class TreasuryProposal {
  constructor(description, amount, recipient) {
    this.id = Math.random().toString(36).slice(2, 10);
    this.description = description;
    this.amount = amount;
    this.recipient = recipient;
    this.approvals = new Set();
    this.status = "pending";
  }

  approve(agentName) {
    this.approvals.add(agentName);
    console.log(`  [+] ${agentName} approved proposal ${this.id}`);
    return this.approvals.size;
  }

  canExecute() {
    return this.approvals.size >= THRESHOLD;
  }
}

async function main() {
  console.log("=== Multi-Agent Treasury Demo ===\n");

  const script = buildTreasuryScript(THRESHOLD, AGENTS);
  console.log("Treasury ErgoScript:");
  console.log(`  ${script}\n`);
  console.log(`Treasury balance: ${Number(TREASURY_BALANCE) / 1e9} ERG`);
  console.log(`Threshold: ${THRESHOLD}-of-${AGENTS.length} signatures required\n`);

  // Proposal 1: small payment — approved unanimously
  console.log("--- Proposal 1: Pay API invoice ---");
  const p1 = new TreasuryProposal("Pay monthly API invoice", 500_000n, "vendor-address");
  console.log(`  Amount: ${Number(p1.amount) / 1e9} ERG → ${p1.recipient}`);
  p1.approve(AGENTS[0].name);
  p1.approve(AGENTS[1].name);

  if (p1.canExecute()) {
    console.log(`  ✓ Threshold met (${p1.approvals.size}/${AGENTS.length}) — executing`);
    console.log(`  TX would use: atLeast(2, ...) — 2 signatures attached`);
  }

  console.log();

  // Proposal 2: large payment — only 1 approval, blocked
  console.log("--- Proposal 2: Emergency compute purchase ---");
  const p2 = new TreasuryProposal("Emergency GPU compute", 8_000_000n, "compute-provider");
  console.log(`  Amount: ${Number(p2.amount) / 1e9} ERG → ${p2.recipient}`);
  p2.approve(AGENTS[2].name);

  if (!p2.canExecute()) {
    console.log(`  ✗ Threshold NOT met (${p2.approvals.size}/${AGENTS.length}) — blocked`);
    console.log(`  Waiting for ${THRESHOLD - p2.approvals.size} more approval(s)`);
  }

  console.log();

  // Show the ErgoScript that enforces this on-chain
  console.log("--- On-chain enforcement ---");
  console.log("Production treasury box ergoTree compiled from:");
  console.log(`  ${script}`);
  console.log("\nTo compile: use ergo-lib-wasm or AppKit");
  console.log("  const tree = ErgoTree.from_base16_bytes(compiledHex)");
  console.log("  const treasuryBox = new OutputBuilder(amount, tree)");
  console.log("\nNo central server. No multisig wallet service.");
  console.log("Enforced by miners. Threshold is in the payment itself.");

  console.log("\n--- Treasury policy config (ergo-agent-pay) ---");
  console.log(JSON.stringify({
    address: "TREASURY_P2S_ADDRESS",
    network: "testnet",
    policy: {
      requireApprovalAbove: String(TREASURY_BALANCE / 10n),
      maxSinglePayment: String(TREASURY_BALANCE / 2n),
    }
  }, null, 2));
}

main().catch(console.error);
