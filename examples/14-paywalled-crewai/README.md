# 14 — Paywalled CrewAI agents

A CrewAI tool whose `_run` is paywalled by an Ergo Note. Identical wire
shape to example 13 (LangChain) — the tool issues a Note via the local
bridge daemon, posts to the seller's API with the Note in headers, and
returns the response to the crew.

The interesting bit is the **multi-agent** flavour: each agent in the
crew shares one `PaymentPolicy` instance, so per-recipient caps and
session budgets apply across the whole crew, not per agent.

## Pieces

```
┌──────────────────────────┐                ┌──────────────────────────┐
│  Buyer (CrewAI)          │                │  Seller (Express +       │
│                          │                │   ergo-agent-api)        │
│  crew.kickoff(...)       │                │                          │
│   └─ researcher.run():   │                │                          │
│      paid_tool._run()    │                │                          │
│      1. policy gate      │                │                          │
│      2. bridge.issueNote │                │                          │
│      3. POST /api/run    │ ─────────────► │  middleware verifies     │
│         X-Note-Box-Id    │                │  + redeems Note,         │
│         X-Task-Output    │                │  routes to handler       │
│      4. parse response   │ ◄───────────── │  returns work            │
└──────────────────────────┘                └──────────────────────────┘
```

* `buyer_tool.py` — `ErgoPaidCrewTool`, a CrewAI `BaseTool` whose `_run`
  pays per call.
* `pricing_policy.py` — shared budget gate, mirrors v2 PolicyEngine.
* `buyer_crew.py` — runnable 2-agent crew (Researcher + Writer).
* `tests/test_paywalled_tool.py` — `unittest` coverage of the wire flow
  against stub bridges + stub HTTP, with no CrewAI dependency.

## Why this matters

CrewAI is the natural home for **delegation** between agents. Without a
payment layer, the orchestrator has no way to express "this sub-agent
gets $X of budget for this leg." With the paywalled tool:

* Every tool call costs a Note issued at call time.
* The Note's R6 task hash commits the agent to **what** it expects —
  if the seller delivers something else, redemption fails.
* `PaymentPolicy.max_session_spend` caps the **whole crew's** total
  spend, regardless of which agent calls the tool.
* `per_recipient_cap` lets the orchestrator say "Researcher can spend
  up to N on Seller A but nothing on Seller B."

## Run it

You need the rest of the stack already running. From a clean clone:

```bash
# Terminal 1 — bridge daemon
ERGO_ADDRESS=9XBuyer... npx ergo-agent-server --network testnet --api-key local

# Terminal 2 — seller's API
SELLER_ADDRESS=9XSeller... node examples/07-end-to-end-agent-economy/server.ts

# Terminal 3 — the crew
cd examples/14-paywalled-crewai
pip install -r requirements.txt
BUYER_ADDRESS=9XBuyer... \
SELLER_ADDRESS=9XSeller... \
RESERVE_BOX_ID=abc... \
ERGO_BRIDGE_URL=http://127.0.0.1:3737 \
ERGO_API_KEY=local \
SELLER_API_URL=http://localhost:3000 \
python buyer_crew.py "summarise this for me: ..."
```

## Tests

```bash
cd examples/14-paywalled-crewai
PYTHONPATH=../../packages/ergo-agent-py python -m unittest discover -s tests -v
```

The tests import the buyer tool only — they do not require CrewAI to be
installed, since the `BaseTool` import falls back to a no-op stub when
`crewai` is missing.
