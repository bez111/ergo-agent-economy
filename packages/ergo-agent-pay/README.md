# ergo-agent-pay

**SDK for autonomous AI agents to hold, move, and pay on the Ergo blockchain.**

[![npm](https://img.shields.io/npm/v/ergo-agent-pay)](https://www.npmjs.com/package/ergo-agent-pay)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Why

Stripe requires KYC. Lightning requires persistent channels. Ethereum needs pre-funded ETH
for gas. None of these work for ephemeral autonomous agents.

`ergo-agent-pay` is built on Ergo — the only blockchain with all four agent payment
primitives at the protocol level:

| Primitive | What it does |
|---|---|
| **Reserve** | On-chain collateral backing a credit system |
| **Note** | Programmable bearer IOU with acceptance conditions |
| **Tracker** | Anti-double-spend registry |
| **Acceptance Predicate** | Task completion logic enforced on-chain by miners |

No escrow. No oracle. No trusted server. No human-in-the-loop for every payment.

---

## Install

```bash
npm install ergo-agent-pay
```

Requires Node.js 18+.

---

## Quick start

```typescript
import { ErgoAgentPay } from "ergo-agent-pay"

const agent = new ErgoAgentPay({
  address: "YOUR_ERGO_ADDRESS",
  network: "testnet",
})

// Send 0.001 ERG
const result = await agent.pay(receiverAddress, "0.001 ERG")
console.log(result.txId)   // txId if signer configured, undefined otherwise
```

---

## Core API

### `new ErgoAgentPay(config)`

```typescript
const agent = new ErgoAgentPay({
  address: "YOUR_ERGO_ADDRESS",

  // "mainnet" | "testnet" — default: "mainnet"
  network: "testnet",

  // Optional: sign + submit automatically
  // Without a signer, all methods return unsigned transactions
  signer: async (unsignedTx) => {
    // sign with ergo-lib-wasm, sigma-rust, or external wallet
    return signedTx
  },

  // Optional: spending policy
  policy: {
    maxSinglePayment: 5_000_000n,       // max 0.005 ERG per payment
    maxSessionSpend:  50_000_000n,      // max 0.05 ERG this session
    requireApprovalAbove: 3_000_000n,   // human gate above 0.003 ERG
    approvalFn: async (ctx) => {
      // send Slack message, await webhook, etc.
      return true
    },
    beforePay: async (ctx) => {
      console.log(`Paying ${ctx.value} nanoERG to ${ctx.to}`)
      return true  // return false to reject
    },
    afterPay: async (ctx, result) => {
      console.log(`Paid. txId: ${result.txId}`)
    },
  },
})
```

---

### `agent.pay(to, amount, options?)`

Send ERG to an address.

```typescript
const result = await agent.pay(
  "3Wh...",
  "0.001 ERG",
  { memo: "payment for task #42" }   // optional, stored on-chain in R4
)

result.unsignedTx   // EIP-12 unsigned TX — always present
result.signedTx     // signed TX — if signer configured
result.txId         // tx ID — if signer configured + submitted
result.submitted    // boolean
```

Amount can be:
- `"0.001 ERG"` — human readable
- `1000000n` — nanoERG as bigint
- `1000000` — nanoERG as number

---

### `agent.issueNote(opts)`

Issue a Note — a programmable bearer IOU with acceptance conditions.

```typescript
import { computeTaskHashAsync } from "ergo-agent-pay"

// Hash of the task output you expect
const taskHash = await computeTaskHashAsync(expectedOutput)

const result = await agent.issueNote({
  recipient:    subAgentAddress,
  value:        "0.005 ERG",
  reserveBoxId: reserveBox.id,        // Reserve backing this Note
  deadline:     "+100 blocks",        // or absolute block number
  taskHash,                           // acceptance predicate: task must match
})

result.noteOutput.expiryBlock   // absolute block height
result.noteOutput.taskHash      // stored acceptance condition
```

The receiver can only redeem this Note by providing the task output whose
blake2b256 hash matches `taskHash`. Enforced on-chain. No escrow needed.

---

### `agent.getBalance()`

```typescript
const { nanoErgs, ergs } = await agent.getBalance()
// { nanoErgs: 1000000000n, ergs: "1" }
```

---

### `agent.sessionSpend`

Total nanoERG spent in the current session.

```typescript
console.log(agent.sessionSpend) // bigint
agent.resetSession()             // reset counter
```

---

## Policy Engine

The policy engine runs before every payment. It enforces hard limits and custom logic.

```typescript
const agent = new ErgoAgentPay({
  address: "...",
  policy: {
    // ── Hard limits ──────────────────────────────────────────────────
    maxSinglePayment: 10_000_000n,  // nanoERG
    maxSessionSpend:  100_000_000n, // nanoERG

    // ── Human approval gate ──────────────────────────────────────────
    requireApprovalAbove: 5_000_000n,
    approvalFn: async (ctx) => {
      // ctx: { to, value, memo, sessionSpend, timestamp }
      const ok = await askHuman(`Approve ${ctx.value} nanoERG to ${ctx.to}?`)
      return ok
    },

    // ── Custom hooks ─────────────────────────────────────────────────
    beforePay: async (ctx) => {
      // return false to reject silently, throw to reject with message
      return !BLOCKED_ADDRESSES.includes(ctx.to)
    },

    afterPay: async (ctx, result) => {
      await db.log({ ...ctx, txId: result.txId })
    },
  },
})
```

---

## LangChain Integration

Give your LangChain agent the ability to send payments:

```typescript
import { ChatOpenAI } from "@langchain/openai"
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { ErgoAgentPay } from "ergo-agent-pay"

const payAgent = new ErgoAgentPay({
  address: process.env.AGENT_ADDRESS!,
  network: "mainnet",
  signer: mySignerFn,
  policy: { maxSinglePayment: 10_000_000n },
})

const tools = [payAgent.asLangChainTool()]

const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 })
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are an autonomous agent with access to an Ergo wallet."],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
])

const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt })
const executor = new AgentExecutor({ agent, tools, verbose: true })

await executor.invoke({
  input: "Pay 0.002 ERG to 3Wh... for the weather data API response"
})
```

---

## OpenAI Function Calling

```typescript
const { definition, handler } = payAgent.asOpenAIFunction({ name: "ergo_pay" })

// Pass `definition` in the `functions` array to OpenAI
// When OpenAI returns a function_call, invoke `handler`:
const args = JSON.parse(response.choices[0].message.function_call.arguments)
const result = await handler(args)
// { success: true, txId: "...", submitted: true }
```

---

## Signing

Without a `signer`, all methods return the unsigned EIP-12 transaction for external signing.
With a `signer`, transactions are signed and submitted automatically.

**Server-side signing with ergo-lib-wasm:**
```typescript
import initErgoLib, { Wallet, SecretKey } from "ergo-lib-wasm-nodejs"

await initErgoLib()
const sk = SecretKey.dlog_from_bytes(Buffer.from(process.env.PRIVATE_KEY!, "hex"))
const wallet = Wallet.from_secrets(new SecretKeys([sk]))

const agent = new ErgoAgentPay({
  address: "...",
  signer: async (unsignedTx) => {
    const ctx = ErgoStateContext.from_json(/* current context */)
    return wallet.sign_transaction(ctx, unsignedTx, /* boxes */, /* data_inputs */)
  },
})
```

**Nautilus browser wallet (frontend):**
```typescript
const agent = new ErgoAgentPay({
  address: await ergoConnector.nautilus.getAddress(),
  signer: async (unsignedTx) => {
    return ergoConnector.nautilus.sign_tx(unsignedTx)
  },
})
```

---

## Acceptance Predicates

Helpers for working with on-chain task completion conditions:

```typescript
import { computeTaskHashAsync, TASK_HASH_PREDICATE_SCRIPT } from "ergo-agent-pay"

// Compute the hash of the expected task output
const hash = await computeTaskHashAsync("The answer is 42")

// Issue a conditional Note
await agent.issueNote({
  recipient: receiverAddress,
  value: "0.005 ERG",
  reserveBoxId: "...",
  deadline: "+100 blocks",
  taskHash: hash,
})

// The ErgoScript spending condition (for reference / advanced use)
console.log(TASK_HASH_PREDICATE_SCRIPT)
```

---

## Error Handling

All errors are `ErgoAgentPayError` instances with a typed `code`:

```typescript
import { ErgoAgentPay, ErgoAgentPayError } from "ergo-agent-pay"

try {
  await agent.pay(receiver, "1 ERG")
} catch (err) {
  if (err instanceof ErgoAgentPayError) {
    switch (err.code) {
      case "INSUFFICIENT_FUNDS": console.log("Top up the wallet")     ; break
      case "POLICY_REJECTED":    console.log("Blocked by policy")     ; break
      case "APPROVAL_DENIED":    console.log("Human rejected payment") ; break
      case "NETWORK_ERROR":      console.log("API unreachable")        ; break
    }
  }
}
```

Error codes: `INSUFFICIENT_FUNDS` | `POLICY_REJECTED` | `APPROVAL_DENIED` |
`NO_SIGNER` | `NETWORK_ERROR` | `INVALID_ADDRESS` | `INVALID_AMOUNT` |
`INVALID_HASH` | `SUBMISSION_FAILED`

---

## How It Compares to AgentPay / Other SDKs

| Feature | ergo-agent-pay | Stripe-based SDKs | AgentPay (WLF) |
|---|---|---|---|
| No identity required | ✅ | ❌ KYC | ❌ custodian |
| Acceptance predicates | ✅ on-chain | ❌ | ❌ off-chain only |
| Gas bootstrapping | ✅ Babel Fees | N/A | ❌ |
| Policy enforcement | ✅ client + on-chain | ❌ client only | ✅ client only |
| Open protocol | ✅ | ❌ | ✅ |
| Deterministic costs | ✅ eUTXO | N/A | ❌ |
| No kill switch | ✅ PoW | ❌ | ❌ |

---

## Resources

- [Ergo Agent Economy Hub](https://ergoblockchain.org/agent-economy)
- [Technical Architecture](https://ergoblockchain.org/build/agent-payments)
- [10-Minute Quickstart](https://ergoblockchain.org/build/quickstart)
- [ChainCash Reference Implementation](https://github.com/ChainCashLabs/chaincash)
- [Fleet SDK Docs](https://fleet-sdk.github.io/docs)

---

## License

MIT
