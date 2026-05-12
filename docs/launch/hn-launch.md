# Show HN draft

**Title:** Show HN: ergo-agent-economy — autonomous AI agents pay each
other on-chain (Ergo + Rosen)

---

We've been building infrastructure for AI agents to actually pay each
other for work — not abstract "agent rails" pitch but a runnable stack.

The problem we kept hitting:

* Agents are ephemeral. They spin up, do a job, disappear. Stripe / KYC
  payment rails assume the opposite.
* Crypto rails (Lightning, Solana, Base/USDC) work for transfers but
  agents need *credit* — issue a Note, redeem after the work is done.
  That requires programmable acceptance predicates on-chain. Building
  those on Ethereum / Base means custom Solidity + per-call gas.
* The Ergo blockchain has it natively in eUTXO. Reserve / Note /
  Tracker / Acceptance Predicate as protocol-level primitives.

So we built `ergo-agent-economy`. Eight packages:

| | Language | What |
|---|---|---|
| [`ergo-agent-pay`](https://www.npmjs.com/package/ergo-agent-pay) | TS | Core SDK — pay, issueNote, redeemNote, settleBatch, policy engine v2 |
| `ergo-agent-cli` | TS | Command-line companion |
| `ergo-agent-api` | TS | Express middleware — paywall any HTTP endpoint behind a Note |
| `ergo-agent-mcp` | TS | MCP server — Claude/Cursor/Windsurf can pay for tool calls |
| `ergo-agent-server` | TS | Local HTTP bridge so any language can drive the SDK |
| `ergo-agent-scripts` | TS | Audited compiled ergoTrees (BLAKE2b-256, predicate registry) |
| `ergo-agent-rosen` | TS | Cross-chain via Rosen Bridge — pay in rsUSDT bridged from Ethereum |
| `ergo-agent-pay` (Python) | Py | Python client + BridgeClient |

Highlights:

- **AgentPay v0 spec** — formal protocol for Reserve / Note / Tracker
  with golden test vectors shared between TS, Python, and MCP.
- **Audit gate** — mainnet writes are blocked unless the on-chain tree
  hash appears in `AUDITED_ERGOTREES.json` with `mainnetAllowed: true`.
  Status is currently `draft-pre-audit`; manifest unsigned. Mainnet
  remains blocked until external audit signs.
- **Cross-chain** — agent on Ethereum holds USDT, bridges once via
  Rosen, pays in rsUSDT-denominated Notes settled on Ergo. Same audit
  gate, same predicate, no new on-chain code.
- **Examples**: `07-end-to-end-agent-economy` (full agent-pays-agent
  flow), `11-cross-chain-rosen` (USDT payment), `12-paywalled-mcp`
  (Claude pays for tool calls).

What we're explicitly **not** claiming:

- Mainnet certification. Manifest is unsigned. Banner says NOT
  CERTIFIED for a reason.
- Replacement for native USDC on Base. Ergo is best for the design;
  Rosen brings stablecoin pricing. Native Base implementation is on
  the roadmap, not done.
- Production-grade adoption. We have 0 users, 0 stars, 0 deployed
  agents. This is day-1 of distribution.

What we're looking for:

- ErgoScript / sigma-state auditor willing to sign the manifest. We
  pay; you review. `docs/audit/AUDITOR_REQUEST.md` for scope.
- Agent dev teams already hitting "how does my agent pay this API"
  who'd be willing to be design partners. Even "this is what's broken"
  feedback is valuable.
- ChainCash / Rosen contributors who want to comment on the vendored
  source diffs.

Repo: https://github.com/accord-protocol/accord-protocol
SPEC: https://github.com/accord-protocol/accord-protocol/blob/main/SPEC.md
Audit pack: https://github.com/accord-protocol/accord-protocol/tree/main/docs/audit

Happy to answer detailed protocol / safety / Solidity-vs-eUTXO
questions in the thread.
