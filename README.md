# Ergo Agent Economy

**The open source hub for building autonomous agentic economic systems on Ergo.**

> Every AI system will need to pay and be paid.
> The question is not whether — but which chain.

---

## What is this?

This repo contains working code examples, technical documentation, and resources for building
autonomous agent payment systems on the [Ergo blockchain](https://ergoplatform.org).

Ergo is the only blockchain with all four primitives agents need at the **protocol level**:

| Primitive | What it does |
|---|---|
| **Reserve** | Collateral UTxO backing a credit system |
| **Note** | Programmable bearer IOU — the payment instrument |
| **Tracker** | Anti-double-spend registry |
| **Acceptance Predicate** | ErgoScript condition encoding task completion in the payment itself |

No ERC-20 wrappers. No application-layer trust. Protocol primitives.

---

## Why existing rails fail agents

| Rail | Fatal flaw for agents |
|---|---|
| Stripe / PayPal | Requires KYC, persistent identity, merchant account |
| Lightning Network | Requires persistent channels — ephemeral agents can't maintain state |
| Ethereum | Non-deterministic gas costs; requires pre-funded ETH wallet per agent |
| Solana | Same gas bootstrapping problem; no acceptance predicate primitives |

Agents are ephemeral processes. They spin up, complete a task, disappear.
Payment rails built for humans assume the opposite.

---

## SDK: ergo-agent-pay

The [`ergo-agent-pay`](./packages/ergo-agent-pay/) package wraps the Ergo agent payment
stack in a clean TypeScript API — with policy engine, LangChain adapter, and OpenAI
function calling support.

```bash
npm install ergo-agent-pay
```

```typescript
import { ErgoAgentPay } from "ergo-agent-pay"

const agent = new ErgoAgentPay({ address: "YOUR_ADDRESS", network: "testnet" })

await agent.pay(receiverAddress, "0.001 ERG")
await agent.issueNote({ recipient, value: "0.005 ERG", reserveBoxId, deadline: "+100 blocks", taskHash })

// LangChain integration
const tools = [agent.asLangChainTool()]

// OpenAI function calling
const { definition, handler } = agent.asOpenAIFunction()
```

→ [Full SDK documentation](./packages/ergo-agent-pay/README.md)

---

## Quick start — 5 minutes to first agent payment

```bash
git clone https://github.com/bez111/ergo-agent-economy
cd ergo-agent-economy/examples/01-basic-payment
npm install
# edit index.js: paste your testnet address
node index.js
```

You'll see an unsigned transaction JSON. Sign with Nautilus (testnet mode) or a server-side key,
then POST to `https://api-testnet.ergoplatform.com/api/v1/transactions`.

Get testnet ERG free at [testnet.ergofaucet.org](https://testnet.ergofaucet.org).

---

## Examples

### [01-basic-payment](./examples/01-basic-payment/)
Send ERG from one address to another on testnet. The "hello world" of Ergo agent payments.
Uses Fleet SDK. ~30 lines. No dependencies beyond `@fleet-sdk/core`.

### [02-note-payment](./examples/02-note-payment/)
Issue a Note — a programmable bearer IOU. Set value, expiry block height, and reserve reference.
The payment instrument used in multi-agent pipelines.

### [03-acceptance-predicate](./examples/03-acceptance-predicate/)
Conditional payment: the Note is redeemable only if `blake2b256(task_output) == TASK_HASH`.
Task completion logic lives in the payment itself — enforced by miners, not your server.

---

## The four primitives — technical reference

### Reserve
A UTxO holding ERG as backing collateral. The spending script enforces:
- Total notes issued ≤ reserve value
- Only authorized issuers can create notes

```scala
sigmaProp(issuedNotes <= SELF.value && PK(issuerKey))
```

### Note
A bearer instrument referencing a Reserve. Contains:
- Value (in nanoERG)
- Expiry block height
- Optional acceptance conditions
- Reserve box ID

```scala
sigmaProp(HEIGHT < expiry && noteValue >= price)
```

### Tracker
A mutable UTxO maintaining the set of spent Note IDs. Every redemption:
1. References the Tracker
2. Tracker verifies Note ID not in spent set
3. Outputs new Tracker state with updated spent set

```scala
sigmaProp(!spentSet.contains(noteId) && validUpdate)
```

### Acceptance Predicate
An ErgoScript condition in the receiver's spending script. The payment only redeems if the
condition is satisfied — enforced on-chain, no oracle, no escrow, no off-chain logic.

```scala
// Accept only if task output hash matches
blake2b256(getVar[Coll[Byte]](0).get) == TASK_HASH
```

---

## Why Ergo — not any other chain

### eUTXO: deterministic by design
Every transaction outcome is known before submission. Agents don't get surprised by gas spikes
or state changes mid-flight. No reentrancy. No hidden global state. No MEV.

### ErgoScript: logic in the payment
Acceptance predicates are first-class language features. The payment IS the contract.
No off-chain oracle needed to enforce task completion.

### Babel Fees: agents don't need ERG to transact
Pay transaction fees in any token. An agent receiving payment in a community token
doesn't need a pre-funded ERG wallet. Spin up, operate, settle — zero bootstrapping.

### Sigma Protocols: private credentials
Zero-knowledge proofs are native. Agents prove task completion without revealing identity.
Privacy at the protocol level, not an add-on.

### PoW: no governance kill switch
No foundation multisig. No validator cartel. No emergency governance pause.
Agent infrastructure built on Ergo won't be frozen.

---

## Reference implementation: ChainCash

[ChainCash](https://github.com/ChainCashLabs/chaincash) is the production implementation of the
Reserve + Note + Tracker stack — live on Ergo mainnet, open source, built by BetterMoneyLabs.

It demonstrates:
- Community currencies backed by ERG reserves
- Programmable IOUs with acceptance conditions
- Agent payment flows at mainnet scale

---

## SDK

```bash
npm install @fleet-sdk/core
```

[Fleet SDK](https://fleet-sdk.github.io/docs) is the official TypeScript/JS SDK for Ergo.
Works in Node.js and browsers. Used in all examples in this repo.

---

## Resources

| Resource | URL |
|---|---|
| Agent economy hub | https://ergoblockchain.org/agent-economy |
| Technical architecture | https://ergoblockchain.org/build/agent-payments |
| 10-minute quickstart | https://ergoblockchain.org/build/quickstart |
| Live testnet demos | https://ergoblockchain.org/demos |
| Comparison vs ETH/SOL | https://ergoblockchain.org/agent-economy/vs |
| Manifesto | https://ergoblockchain.org/agent-economy/manifesto |
| Blog: Why agents can't use Stripe | https://ergoblockchain.org/blog/agents-cant-use-stripe |
| Ergo Explorer (testnet) | https://testnet.ergoplatform.com |
| Ergo testnet API | https://api-testnet.ergoplatform.com |
| Fleet SDK docs | https://fleet-sdk.github.io/docs |
| ChainCash repo | https://github.com/ChainCashLabs/chaincash |

---

## Contributing

PRs welcome. Especially:
- More working examples (Python, Rust, other languages)
- Real agent payment flows (API call payments, multi-agent orchestration)
- ChainCash integration examples
- Production deployment patterns

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT
