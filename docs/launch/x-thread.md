# X (Twitter) launch thread

**Tweet 1 / pinned:**

We shipped ergo-agent-economy v0.3.0 — a payment + credit protocol for
autonomous AI agents.

Agent A pays Agent B for an API call → with on-chain acceptance
predicates that fail closed if the work isn't done. No KYC, no
custody, no "Stripe for agents".

8 packages, all open source. ↓

**Tweet 2:**

The story:

```
Agent on Base holds USDT
   ↓ (one-time bridge via Rosen)
   rsUSDT on Ergo
   ↓
Issue Note: 5 rsUSDT, expiry +100 blocks,
            R6 = blake2b256("expected output")
   ↓
POST /api/analyze + X-Note-Box-Id
   ↓
Server verifies on-chain → redeems → returns result
```

Buyer never holds ERG. Seller batches outbound bridges.

**Tweet 3:**

Why eUTXO instead of Solidity escrow on Base:

- Programmable acceptance predicates *as registers* — no per-call gas.
- Bearer Notes that travel hand-to-hand without contract calls.
- Storage-rent-free for ~3y (perfect for receipts).
- Trustless data-input oracles built in.

Rosen brings the USD stable layer; Ergo carries the credit primitives.

**Tweet 4:**

What's audited:

- BLAKE2b-256 hash function (matches ErgoScript's `blake2b256` exactly,
  shared golden vectors across TS / Python / MCP).
- Two-gate mainnet safety: refuse without `scriptErgoTree`, refuse
  without an audit-manifest entry with `mainnetAllowed: true`.
- 21 deep-review findings, 10 fixed, 11 awaiting external auditor.

`AUDITED_ERGOTREES.json` is `draft-pre-audit`. NOT CERTIFIED FOR
MAINNET until signed.

**Tweet 5:**

Tools for AI agents to use today (testnet):

- `ergo-agent-pay` (npm) — TS SDK
- `ergo-agent-mcp` (npm) — MCP server, Claude/Cursor/Windsurf
- `ergo-agent-pay` (PyPI) — Python client
- `ergo-agent-cli` — command-line
- `ergo-agent-api` — Express middleware (HTTP 402)
- `ergo-agent-rosen` — cross-chain to Ethereum/Base via USDT

**Tweet 6:**

Looking for:

- ErgoScript / sigma-state auditor (paid, willing-to-sign)
- Agent dev teams hitting "how does my agent pay this thing" — design
  partners
- ChainCash / Rosen contributors for the vendored source review

Repo: https://github.com/accord-protocol/accord-protocol

Replies > DMs. Detailed Q&A welcome.

---

**Don't post tweets 1-6 separately — thread them.** First tweet is the
hook; tweets 2-3 are the elevator pitch; 4-5 are credibility; 6 is the
ask. ~280 chars each.
