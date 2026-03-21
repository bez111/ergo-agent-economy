# Example 10 — AutoGen Multi-Agent Conversation with Ergo Payments

Two AutoGen agents (ClientAgent and ProviderAgent) negotiate a service contract and settle payment using an Ergo Note. The client attaches a Note as a payment promise when requesting a task; the provider redeems it upon completion. The mock mode demonstrates the full negotiation → execution → settlement flow without requiring AutoGen or an LLM API key.

## Conversation flow

```
ClientAgent   → NEGOTIATE: budget offer (Note box ID)
ProviderAgent → accepts
ClientAgent   → TASK: description + Note payment attached
ProviderAgent → executes task, redeems Note, returns result
ClientAgent   → settlement confirmed
```

## Run — mock (no dependencies)

```bash
python agent.py
```

Uses `MockConversationAgent` to simulate AutoGen message passing. Calls the ergo-agent-pay API server for analysis (falls back gracefully if offline).

## Run — real AutoGen

```bash
pip install pyautogen
export OPENAI_API_KEY="sk-..."
# Optionally start the payment server:
cd ../05-api-payment-server && node server.js
export CLIENT_NOTE_BOX_ID="<your-note-box-id>"
python agent.py --autogen
```

In real AutoGen mode, `ergo_pay_tool` is registered as a callable function tool. The ClientAgent calls it, the ProviderAgent executes it, and results flow back through the conversation.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ERGO_API_SERVER` | `http://localhost:3000` | ergo-agent-pay server URL |
| `CLIENT_NOTE_BOX_ID` | `aaa...aaa` | Box ID of the client's budget Note |
| `OPENAI_API_KEY` | — | Required only for `--autogen` mode |
