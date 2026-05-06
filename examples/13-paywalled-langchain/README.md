# 13 — Paywalled LangChain agent

A LangChain `Tool` that the agent can only successfully invoke if it
attaches a valid Ergo Note. The host's API verifies the Note on-chain
(via `ergo-agent-api`'s middleware), redeems it inline when a signer is
configured, then runs the actual handler. The LLM-side integration is
ordinary LangChain — the paywall is on the wire.

## Two pieces

```
┌──────────────────────────┐                ┌──────────────────────────┐
│  Buyer (LangChain)       │                │  Seller (Express +       │
│                          │                │   ergo-agent-api)        │
│  agent_executor.run(...) │                │                          │
│   └─ tool.invoke(text):  │                │                          │
│      1. agent.issueNote  │                │                          │
│      2. POST /api/run    │ ─────────────► │  middleware verifies     │
│         X-Note-Box-Id    │                │  + redeems Note,         │
│         X-Task-Output    │                │  routes to handler       │
│      3. parse response   │ ◄───────────── │  returns work            │
└──────────────────────────┘                └──────────────────────────┘
```

* `seller.py` — Flask server using a placeholder JSON-API for the LLM-side
  call. Drop in any LangChain-compatible HTTP-server framework.
* `buyer_tool.py` — defines `ErgoPaidTool`, a LangChain `BaseTool` whose
  `_run` issues a Note via `BridgeClient` (talking to `ergo-agent-server`),
  posts to the seller's API with the Note in the headers, and returns the
  HTTP response body to the agent loop.
* `pricing_policy.py` — small wrapper that lifts `ergo-agent-pay`'s
  `PolicyEngine` budget caps into the LangChain agent boundary, so the
  LLM can't accidentally drain a budget by spamming the tool.

## Why this matters

Today, LangChain agents call HTTP tools with no payment layer. The host
typically rate-limits or refuses requests outside an allowlist. With
this example:

* Every tool invocation **costs a Note** the agent issues at call time.
* The Note's acceptance predicate (R6 task hash) **commits the agent to
  what it expects** — if the seller delivers something else, the
  agent's redemption fails, the seller never gets paid.
* The buyer's `PolicyEngine` enforces budget caps **before** the Note
  is issued, so the LLM's plan can't exceed a prearranged spend.
* The seller's middleware enforces replay protection, so if the agent
  retries, it can't double-spend the same Note.

## Run it

You need the rest of the stack already running. From a clean clone of
this repo:

```bash
# Terminal 1 — the bridge daemon (so Python can drive the SDK)
ERGO_ADDRESS=9XBuyer... npx ergo-agent-server --network testnet --api-key local

# Terminal 2 — the seller's API
SELLER_ADDRESS=9XSeller... node examples/07-end-to-end-agent-economy/server.ts

# Terminal 3 — the LangChain agent
cd examples/13-paywalled-langchain
pip install -r requirements.txt
BUYER_ADDRESS=9XBuyer... \
SELLER_ADDRESS=9XSeller... \
RESERVE_BOX_ID=abc... \
ERGO_BRIDGE_URL=http://127.0.0.1:3737 \
ERGO_API_KEY=local \
SELLER_API_URL=http://localhost:3000 \
python buyer_agent.py "summarise this for me: ..."
```

## What's in this folder

* `requirements.txt` — pins LangChain + the Python `ergo-agent-pay`
  package.
* `buyer_tool.py` — the `ErgoPaidTool` class.
* `buyer_agent.py` — a runnable LangChain ReAct-agent loop using the
  paid tool.
* `pricing_policy.py` — `PolicyEngine`-driven budget gate.
* `tests/test_paywalled_tool.py` — Python `unittest` coverage of the
  tool's input → Note flow against a stub bridge + stub seller.
