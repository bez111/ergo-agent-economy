# ergo-agent-pay (Python)

Python SDK for autonomous AI agent payments on the [Ergo blockchain](https://ergoplatform.org).

Zero required dependencies — uses Python standard library only.

```bash
pip install ergo-agent-pay
```

## Quick start

```python
from ergo_agent_pay import ErgoAgentPay

agent = ErgoAgentPay(address="YOUR_ADDRESS", network="testnet")

# Check balance
balance = agent.get_balance()
print(f"Balance: {balance['ergs']} ERG")

# Inspect a Note
note = agent.check_note("abc123...")
print(f"Note value: {note.value_erg} ERG")
print(f"Expired: {note.is_expired}")
print(f"Task hash: {note.task_hash}")

# Compute task hash for acceptance predicate
task_hash = ErgoAgentPay.compute_task_hash("task output here")
```

## LangChain integration

```python
from ergo_agent_pay import ErgoAgentPay

agent = ErgoAgentPay(address="YOUR_ADDRESS", network="testnet")
tool = agent.as_langchain_tool(server_url="http://localhost:3000")

# Use in any LangChain agent
from langchain.agents import AgentExecutor
tools = [tool]
```

## OpenAI function calling

```python
definition = agent.as_openai_function()

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Pay 0.001 ERG to <address>"}],
    tools=[{"type": "function", "function": definition}],
)
```

## Transaction building

Python doesn't have a Fleet SDK equivalent. For full transaction building, use:
- **TypeScript SDK** (recommended): run `ergo-agent-pay` TypeScript server, call via HTTP
- **ergpy**: `pip install ergpy` — AppKit JVM wrapper
- **sigma-rust**: Python bindings for Rust-based TX builder

See [example 06](../../examples/06-python-agent/) for the HTTP delegation pattern.

## Note lifecycle — what Python can do

| Operation | Python | TypeScript |
|---|---|---|
| Get balance | ✅ | ✅ |
| Get UTxOs | ✅ | ✅ |
| Check note (decode registers) | ✅ | ✅ |
| Compute task hash | ✅ (sha256) | ✅ (blake2b256) |
| LangChain tool | ✅ | ✅ |
| OpenAI function | ✅ | ✅ |
| Build TX (issueNote, pay) | Via HTTP server | ✅ native |
| Sign TX | External | ✅ signer fn |
| Submit TX | ✅ | ✅ |

## API reference

Full API reference: [docs/api-reference.md](../../docs/api-reference.md)
