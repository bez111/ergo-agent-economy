# Ergo Agent Economy

**The open source hub for building autonomous agentic economic systems on Ergo.**

> Every AI system will need to pay and be paid.
> The question is not whether — but which chain.

---

## What is this?

This repo contains working code examples, technical documentation, and resources for building
autonomous agent payment systems on the [Ergo blockchain](https://ergoplatform.org).

Here's the thing: agents need to move money without asking permission. They spin up, do a job,
get paid, and disappear. Traditional payment rails assume you're a human with a bank account,
KYC documents, and persistent identity. Agents have none of that.

Ergo is the only blockchain with all four primitives agents need at the **protocol level**:

| Primitive | What it does |
|---|---|
| **Reserve** | Collateral UTxO backing a credit system |
| **Note** | Programmable bearer IOU — the payment instrument |
| **Tracker** | Anti-double-spend registry |
| **Acceptance Predicate** | ErgoScript condition encoding task completion in the payment itself |

No ERC-20 wrappers. No application-layer trust. Just protocol primitives that work.

---

## Agents can create their own credit

Here's where it gets interesting: agents don't just transact — they can issue credit.

An agent with a reserve UTxO can create Notes (programmable IOUs) that circulate as payment
instruments. These aren't just tokens. They're bearer bonds with built-in expiration dates,
acceptance conditions, and collateral backing.

**Why this matters:**

- **No pre-funding required** — An agent can start with a reserve and issue credit as it works
- **Self-enforcing terms** — The Note itself encodes when it expires, what conditions must be met
- **Composable credit** — Notes can be re-spent, split, merged without touching the reserve
- **No credit checks** — The reserve backs the credit. Counterparties verify the reserve, not the agent

Think of it like a traveler's check for AI agents. The reserve is the vault. The Note is the
check. The Tracker prevents double-spending. The acceptance predicate ensures the check only
cashes if the job gets done.

This isn't theoretical. [ChainCash](https://github.com/ChainCashLabs/chaincash) runs this stack
on mainnet today. Community currencies backed by ERG reserves, circulating as agent payment rails.

---

## Basis: Local Credit, Global Settlement

[Basis](./docs/basis/) is the off-chain credit layer built on top of Ergo's on-chain primitives.
It's the full economic stack for agents and communities.

### The Problem Basis Solves

On-chain payments are expensive. Lightning Network and similar systems require 100% collateral —
no credit creation. Basis changes this:

- **Off-chain IOUs** — Payments happen off-chain, low fees, instant
- **Credit creation** — Issuers can create unbacked notes within trust relationships
- **Optional reserves** — When trust isn't enough, on-chain collateral backs the credit
- **Global settlement** — Redeem against on-chain reserves when needed

### How Basis Works

```
┌─────────────┐      IOU      ┌─────────────┐
│  Issuer A   │──────────────►│ Receiver B  │
│  (debt)     │  "10 ERG"     │ (creditor)  │
└─────────────┘               └─────────────┘
       │                           │
       │                           │
       ▼                           ▼
┌─────────────────────────────────────────┐
│           Tracker Service               │
│  - Records A→B debt off-chain          │
│  - Commits state to Ergo periodically  │
│  - Can't steal, only facilitates       │
└─────────────────────────────────────────┘
       │
       │ (if redemption needed)
       ▼
┌─────────────────────────────────────────┐
│     On-Chain Reserve Contract           │
│  - Backs credit with ERG collateral     │
│  - Enforces redemption rules            │
│  - Emergency exit if tracker disappears │
└─────────────────────────────────────────┘
```

### Key Properties

**For agents:**
- Autonomous credit relationships — agents issue debt to other agents
- Reserve created after work completes (human provides backing)
- No third-party custody — pure P2P

**For communities:**
- Works offline — trade over mesh networks, sync when connected
- Trust-based within circles, reserve-backed across circles
- No forced collateralization — use credit where trust exists

**Security:**
- Tracker can't redeem others' notes (signature verification)
- Tracker going offline? Last on-chain commitment is redeemable
- Tracker censoring? Anti-censorship protection via on-chain proofs
- Tracker colluding? Anti-collusion via increasing debt amounts

### The IOU Note Structure

An IOU note from A to B is:
```
(B_pubkey, amount, timestamp, signature_A)
```

- `amount` is the **total** debt A owes B (cumulative)
- `timestamp` is the last payment time
- Only one note per A→B pair stored by tracker
- Tracker commits to a tree with `hash(A ++ B)` as key

Redemption happens on-chain after a 1-week timelock. This gives the tracker time to update
state and prevents old-note attacks.

### Triangular Trade (Debt Transfer)

Basis supports debt transfer with issuer consent:

```
Before:                    After:
A owes B 10 ERG           A owes B 5 ERG
                          A owes C 5 ERG

B buys from C → A's debt partially transfers to C
No on-chain redemption needed!
```

This enables complex economic relationships without touching the blockchain.

→ [Full Basis documentation](./docs/basis/)
→ [Basis whitepaper](./docs/basis/whitepaper/chaincash.pdf)

---

## Why existing rails fail agents

Let's be clear: existing payment infrastructure wasn't built for ephemeral processes.

| Rail | Fatal flaw for agents |
|---|---|
| Stripe / PayPal | Requires KYC, persistent identity, merchant account |
| Lightning Network | Requires persistent channels — ephemeral agents can't maintain state |
| Ethereum | Non-deterministic gas costs; requires pre-funded ETH wallet per agent |
| Solana | Same gas bootstrapping problem; no acceptance predicate primitives |

Agents are ephemeral processes. They spin up, complete a task, disappear.
Payment rails built for humans assume the opposite.

That mismatch is why agents can't just "use Stripe" or "hook into Lightning." The assumptions
these systems make — that you have identity, that you persist, that you pre-fund — don't hold
for agents.

---

## SDK: ergo-agent-pay

The [`ergo-agent-pay`](./packages/ergo-agent-pay/) package wraps the Ergo agent payment
stack in a clean TypeScript API — with policy engine, LangChain adapter, and OpenAI
function calling support.

It's what you'd reach for when building agent payment flows that need to:
- Issue and redeem Notes
- Manage reserves
- Enforce acceptance predicates
- Plug into LangChain or OpenAI function calling

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

You don't need much to get running. Clone the repo, grab some testnet ERG, and you're off.

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

If you're building something more serious, jump to the [SDK docs](./packages/ergo-agent-pay/README.md)
or check out [ChainCash](https://github.com/ChainCashLabs/chaincash) for a production reference.

---

## Examples

These aren't toy projects. They're starting points for real agent payment flows.

### [01-basic-payment](./examples/01-basic-payment/)
Send ERG from one address to another on testnet. The "hello world" of Ergo agent payments.
Uses Fleet SDK. ~30 lines. No dependencies beyond `@fleet-sdk/core`.

Start here if you're new. Get a transaction working. Then move on.

### [02-note-payment](./examples/02-note-payment/)
Issue a Note — a programmable bearer IOU. Set value, expiry block height, and reserve reference.
The payment instrument used in multi-agent pipelines.

This is where agents create credit. The Note circulates as payment, backed by the reserve,
expiring at a block height you control.

### [03-acceptance-predicate](./examples/03-acceptance-predicate/)
Conditional payment: the Note is redeemable only if `blake2b256(task_output) == TASK_HASH`.
Task completion logic lives in the payment itself — enforced by miners, not your server.

This is the killer feature. You're not just sending money. You're encoding "pay when done"
into the transaction. No escrow service. No oracle. Just math.

---

## The four primitives — technical reference

Here's how each primitive works under the hood.

These are the **on-chain** primitives. The [Basis](./docs/basis/) layer builds off-chain
credit on top of them.

### Reserve
A UTxO holding ERG as backing collateral. The spending script enforces:
- Total notes issued ≤ reserve value
- Only authorized issuers can create notes

This is the vault. Everything else builds on top.

```scala
sigmaProp(issuedNotes <= SELF.value && PK(issuerKey))
```

### Note
A bearer instrument referencing a Reserve. Contains:
- Value (in nanoERG)
- Expiry block height
- Optional acceptance conditions
- Reserve box ID

The Note is what circulates. It's a check drawn on the reserve, with conditions attached.

```scala
sigmaProp(HEIGHT < expiry && noteValue >= price)
```

### Tracker
**On-chain:** A mutable UTxO maintaining the set of spent Note IDs. Every redemption:
1. References the Tracker
2. Tracker verifies Note ID not in spent set
3. Outputs new Tracker state with updated spent set

Without the Tracker, Notes could be double-spent. The Tracker is the ledger that remembers.

```scala
sigmaProp(!spentSet.contains(noteId) && validUpdate)
```

**Off-chain (Basis):** A service that:
- Records IOU notes off-chain (`A→B, amount, timestamp`)
- Commits state digests to Ergo periodically
- Publishes events via NOSTR protocol
- Provides API for wallets and clients
- Can't steal funds — only facilitates redemption

The off-chain tracker minimizes trust while enabling cheap, fast payments.

### Acceptance Predicate
An ErgoScript condition in the receiver's spending script. The payment only redeems if the
condition is satisfied — enforced on-chain, no oracle, no escrow, no off-chain logic.

This is where you encode "the job must be done" into the payment itself.

```scala
// Accept only if task output hash matches
blake2b256(getVar[Coll[Byte]](0).get) == TASK_HASH
```

---

## Why Ergo — not any other chain

You could try to build this on Ethereum. Or Solana. Or Bitcoin with Lightning.
Here's why you probably shouldn't.

### eUTXO: deterministic by design
Every transaction outcome is known before submission. Agents don't get surprised by gas spikes
or state changes mid-flight. No reentrancy. No hidden global state. No MEV.

With account-based chains, your agent submits a transaction and hopes the state doesn't change
before it's confirmed. With eUTXO, the transaction either works or it doesn't — no surprises.

### ErgoScript: logic in the payment
Acceptance predicates are first-class language features. The payment IS the contract.
No off-chain oracle needed to enforce task completion.

On Ethereum, you'd need a smart contract. On Ergo, the payment script itself encodes the logic.
Lighter. Cheaper. Simpler.

### Babel Fees: agents don't need ERG to transact
Pay transaction fees in any token. An agent receiving payment in a community token
doesn't need a pre-funded ERG wallet. Spin up, operate, settle — zero bootstrapping.

Try this on Ethereum: your agent needs ETH for gas. Always. Even if it's being paid in USDC.
That's a problem when agents are ephemeral.

### Sigma Protocols: private credentials
Zero-knowledge proofs are native. Agents prove task completion without revealing identity.
Privacy at the protocol level, not an add-on.

### PoW: no governance kill switch
No foundation multisig. No validator cartel. No emergency governance pause.
Agent infrastructure built on Ergo won't be frozen.

Proof of work means no one can change the rules on you. For agents that move money,
that's not a bug — it's a requirement.

---

## Reference implementation: ChainCash

[ChainCash](https://github.com/ChainCashLabs/chaincash) is the production implementation of the
Reserve + Note + Tracker stack — live on Ergo mainnet, open source, built by BetterMoneyLabs.

It demonstrates:
- Community currencies backed by ERG reserves
- Programmable IOUs with acceptance conditions
- Agent payment flows at mainnet scale

If you're building something serious, study ChainCash. It's the real deal.

---

## Basis: Implementation & Roadmap

[Basis](./docs/basis/) is the next evolution — off-chain credit with on-chain settlement.

### Current Status

**✅ Working:**
- Reserve contract on Ergo
- Tracker prototype
- P2P payment flows tested
- Emergency redemption tested

**🚧 Building:**
- Rust implementation (production server)
- Mesh network demos
- Agent economy simulations

### Implementation Roadmap

1. **Tests for Basis contract** — Like ChainCashSpec (Scala)
2. **Token-based reserve variant** — Support for wrapped assets (ErgoScript)
3. **Production tracker service** — Rust-based, collects off-chain notes, tracks reserves
4. **Celaut payment module** — Peer credit limits, agentic layer support
5. **Agent-to-agent showcase** — Working demo of autonomous credit
6. **Community wallet** — Telegram bot or similar for local trading
7. **NOSTR zaps alternative** — Decentralized micropayments

### Monetization Opportunities

**For operators:**
- Run a tracker node — earn fees on settlements
- Issue backed IOUs — create local credit systems
- Liquidity provision — earn from reserve management
- Gateway services — cash ↔ crypto on/off-ramp

**For developers:**
- Consulting & support for deployments
- Protocol extensions — grants, bounties, donations
- Custom deployments — white-label for communities

→ [Basis whitepaper](./docs/basis/whitepaper/chaincash.pdf)
→ [Basis presentation](./docs/basis/presentation/presentation.md)

---

## SDK

```bash
npm install @fleet-sdk/core
```

[Fleet SDK](https://fleet-sdk.github.io/docs) is the official TypeScript/JS SDK for Ergo.
Works in Node.js and browsers. Used in all examples in this repo.

You don't need much else. Fleet handles the heavy lifting.

---

## Resources

### Documentation
| Resource | URL |
|---|---|
| Agent economy hub | https://ergoblockchain.org/agent-economy |
| Technical architecture | https://ergoblockchain.org/build/agent-payments |
| 10-minute quickstart | https://ergoblockchain.org/build/quickstart |
| Live testnet demos | https://ergoblockchain.org/demos |
| Comparison vs ETH/SOL | https://ergoblockchain.org/agent-economy/vs |
| Manifesto | https://ergoblockchain.org/agent-economy/manifesto |
| Blog: Why agents can't use Stripe | https://ergoblockchain.org/blog/agents-cant-use-stripe |

### Basis & ChainCash
| Resource | URL |
|---|---|
| Basis documentation | ./docs/basis/ |
| Basis whitepaper | ./docs/basis/whitepaper/chaincash.pdf |
| Basis presentation | ./docs/basis/presentation/presentation.md |
| ChainCash repo | https://github.com/ChainCashLabs/chaincash |
| ChainCash Telegram | https://t.me/chaincashtalks |

### Tools & Networks
| Resource | URL |
|---|---|
| Ergo Explorer (testnet) | https://testnet.ergoplatform.com |
| Ergo testnet API | https://api-testnet.ergoplatform.com |
| Fleet SDK docs | https://fleet-sdk.github.io/docs |
| Ergo Platform | https://ergoplatform.org |

---

## Contributing

PRs welcome. Especially:
- More working examples (Python, Rust, other languages)
- Real agent payment flows (API call payments, multi-agent orchestration)
- ChainCash integration examples
- Production deployment patterns

If you've built something, share it. The agent economy needs more working code.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT
