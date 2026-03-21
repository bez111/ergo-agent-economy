# Example 06 — Python AI Agent with Ergo Payments

Python agent that pays for API calls using Ergo Notes.
Works standalone or as a LangChain tool.

## Quick start

```bash
pip install requests
python agent.py
```

## With LangChain

```bash
pip install langchain langchain-openai requests
export OPENAI_API_KEY="sk-..."
export ERGO_NOTE_BOX_ID="<your-note-box-id>"
python agent.py --langchain
```

## What this demonstrates

- Fetching Note info from Ergo testnet API (Python, no Node.js)
- Calling an ergo-agent-pay powered server with Note payment
- Wrapping the payment as a LangChain `StructuredTool`
- Register decoding: R5 (SInt zigzag), R6 (SColl[SByte])

## Prerequisites

- Example 05 server running: `cd ../05-api-payment-server && node server.js`
- A valid Note box ID (run example 02 to issue one)
- Testnet ERG: https://testnet.ergofaucet.org
