# Example 09 — CrewAI Multi-Agent System with Ergo Payments

A 3-agent CrewAI crew (Researcher → Analyst → Writer) where each agent pays the next using an Ergo Note. The orchestrator issues an initial budget Note to the Writer, who delegates sub-budgets down the chain. Each payment has an acceptance predicate: the Note only releases when the task output hash matches the value stored in register R6.

## Payment flow

```
Orchestrator → Writer (budget Note)
Writer       → Analyst (sub-budget Note)
Analyst      → Researcher (sub-budget Note)
```

## Run — mock (no dependencies)

```bash
python agent.py
# or explicitly:
python agent.py --mock
```

No crewai or network required. Demonstrates the payment delegation pattern using local mock agents that call the ergo-agent-pay API server (falls back gracefully if server is offline).

## Run — real CrewAI

```bash
pip install crewai
# Start the payment server first:
cd ../05-api-payment-server && node server.js
export WRITER_NOTE_BOX_ID="<your-note-box-id>"
python agent.py --crewai
```

The real CrewAI mode wires `ErgoAnalyzeTool` into each agent so payments flow through the live API server on every LLM tool call.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ERGO_API_SERVER` | `http://localhost:3000` | ergo-agent-pay server URL |
| `WRITER_NOTE_BOX_ID` | `aaa...aaa` | Box ID of the Writer's initial budget Note |
