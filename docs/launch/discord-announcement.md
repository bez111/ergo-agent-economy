# Discord launch announcement

Targeted at agent-dev communities. Post one variant per server, not the
same text twice.

## LangChain / LangGraph Discord

> 🪙 **AI agents that pay each other on-chain — open-source, MCP-compatible**
>
> Just shipped `ergo-agent-economy` — a payment + credit protocol where
> autonomous agents can issue **Notes** (programmable IOUs) and gate
> redemption behind acceptance predicates. The bearer of the Note has
> to prove the work's complete (e.g. by revealing bytes that hash to
> the predicate's R6) for the contract to release the value.
>
> The flow that matters for LangChain:
> ```python
> from ergo_agent_pay import BridgeClient
> bridge = BridgeClient("http://127.0.0.1:3737", api_key=KEY)
> note = bridge.issue_note(recipient=B, value="0.005 ERG",
>     deadline="+100 blocks", task_output="42")
> ```
> Agent B redeems only by revealing the matching task output. If they
> didn't actually do the work, they can't redeem.
>
> Repo: https://github.com/accord-protocol/accord-protocol
> Killer demo: https://github.com/accord-protocol/accord-protocol/tree/main/examples/07-end-to-end-agent-economy
>
> Looking for design partners — would love feedback on the Python
> SDK shape.

---

## CrewAI Discord

> 🤝 **Want your CrewAI orchestrator to pay sub-agents in real money?**
>
> `ergo-agent-economy` lets a parent agent issue **budgeted Notes** to
> sub-agents — value-capped + acceptance-predicate-bound. The
> sub-agent can only collect the Note if their output matches what the
> orchestrator asked for. Spent budget, no risk of paying for nothing.
>
> Example with a CrewAI-style 3-agent pipeline:
> https://github.com/accord-protocol/accord-protocol/tree/main/examples/04-orchestrator-budget
>
> Looking for early CrewAI users to try it on testnet.

---

## AutoGen Discord

> 💸 **Multi-agent payments with built-in escrow — no custodial server**
>
> AutoGen agents negotiate; one of them owes another. We built
> `ergo-agent-economy` so the payment side has the same expressiveness
> as the negotiation side — Notes carry acceptance conditions
> on-chain.
>
> The difference vs Stripe / Solana / Lightning rails:
> - Programmable predicates: payment fails if the result doesn't match.
> - Bearer instruments: a Note can be passed agent-to-agent without
>   server-side state.
> - Credit primitive: agents can issue Notes against a Reserve they
>   set up after the work, not before.
>
> Example: https://github.com/accord-protocol/accord-protocol/tree/main/examples/10-autogen-agent
>
> Repo: https://github.com/accord-protocol/accord-protocol

---

## Anthropic / MCP Discord (when public)

> 🪙 **MCP server with paywalled tools — Claude pays per call**
>
> Just dropped `ergo-agent-mcp@0.3.0` with the
> `createPaywalledTool({ pricing, agent, handler })` pattern. Wrapping
> any MCP tool turns it into a paid endpoint:
>
> ```ts
> const summarise = createPaywalledTool({
>   name: "summarise",
>   pricing: 1_000_000n,        // 0.001 ERG
>   agent,
>   handler: async (args, { payment }) => ({ ... })
> })
> ```
>
> Tool's `inputSchema` gets `note_box_id` and `task_output` injected;
> Claude/Cursor see them in `tools/list` and pass a Note in the call.
> The handler runs only after the Note verifies on-chain.
>
> Repo: https://github.com/accord-protocol/accord-protocol
> Demo: https://github.com/accord-protocol/accord-protocol/tree/main/examples/12-paywalled-mcp
> Listing on mcp.so: pending submission.
>
> Feedback on the wire-level convention especially welcome.

---

**Posting rules:**

* No more than one post per server. Don't cross-post.
* Always reply to thread questions within 24h.
* If asked "why not Base/USDC native" — be honest, link to the
  `docs/cross-chain.md` migration plan.
