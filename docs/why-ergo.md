# Why Ergo — Not Any Other Chain

## The requirements for an agent economy base layer

Autonomous agents need a blockchain that satisfies all of the following:

1. **No identity requirement** — any key pair can transact, no KYC, no merchant account
2. **Deterministic costs** — agent knows the exact fee before submitting
3. **Micropayment viability** — $0.001 per API call must be economically feasible
4. **Programmable acceptance** — payment can encode task completion conditions
5. **Credit issuance** — orchestrators issue programmatic IOUs to sub-agents
6. **No gas bootstrapping** — agents don't need native tokens pre-loaded to operate
7. **No governance kill switch** — infrastructure can't be frozen by a committee

No existing chain satisfies all seven. Ergo satisfies all seven.

---

## Chain-by-chain comparison

### Ethereum

| Requirement | Ethereum |
|---|---|
| No identity | ✅ Any key pair |
| Deterministic costs | ❌ Gas price is a market — unknown at build time |
| Micropayments | ❌ Gas costs make sub-$1 transactions uneconomical |
| Programmable acceptance | ⚠️ Possible via Solidity but complex, reentrancy risk |
| Credit issuance | ⚠️ ERC-20 + custom contracts, deployment required |
| No gas bootstrapping | ❌ Must pre-fund ETH wallet for gas |
| No kill switch | ⚠️ Foundation + validator majority have coordination power |

**Fatal for agents:** Non-deterministic gas and mandatory ETH pre-funding.
Every ephemeral agent needs an ETH wallet. You can't pay gas in the token you're transacting with.

### Solana

| Requirement | Solana |
|---|---|
| No identity | ✅ |
| Deterministic costs | ⚠️ More predictable but still congestion-dependent |
| Micropayments | ✅ Low fees |
| Programmable acceptance | ❌ Account model — no native spending condition primitives |
| Credit issuance | ❌ No native bearer instrument concept |
| No gas bootstrapping | ❌ Must pre-fund SOL for fees |
| No kill switch | ❌ Validator set can coordinate emergency actions |

**Fatal for agents:** No native acceptance predicate primitives. Account model means
every "payment" requires an on-chain program call — no bearer instruments.

### Lightning Network

| Requirement | Lightning |
|---|---|
| No identity | ✅ |
| Deterministic costs | ✅ |
| Micropayments | ✅ Sub-cent payments work |
| Programmable acceptance | ❌ HTLCs only — no custom conditions |
| Credit issuance | ❌ No programmable IOU concept |
| No gas bootstrapping | ❌ Must open funded channels beforehand |
| No kill switch | ✅ |

**Fatal for agents:** Channels require persistent state that ephemeral agents can't maintain.
Both parties must be online. HTLCs can't encode custom acceptance predicates.

### Ergo

| Requirement | Ergo |
|---|---|
| No identity | ✅ Any key pair |
| Deterministic costs | ✅ eUTXO — outcome known before submission |
| Micropayments | ✅ ~$0.01 per transaction on mainnet |
| Programmable acceptance | ✅ Native ErgoScript in every UTxO |
| Credit issuance | ✅ Reserve + Note protocol primitives |
| No gas bootstrapping | ✅ Babel Fees — pay in any token |
| No kill switch | ✅ GPU Proof-of-Work, no foundation multisig |

---

## The eUTXO advantage

Ethereum's account model means every transaction changes global state. Agents must
sequence carefully to avoid conflicts. State can change between simulation and execution.

Ergo's eUTXO model means each transaction consumes specific inputs and creates specific outputs.
The outcome is **deterministic** — you can simulate it completely before submitting.

For agents, this means:
- Cost is exactly known before the transaction
- No reentrancy attacks possible (each UTxO spent exactly once)
- No MEV — miners can't reorder transactions to extract value from your agent
- Parallel execution possible — independent UTxOs don't conflict

## ErgoScript vs Solidity

Solidity is a Turing-complete language executing on the EVM.
ErgoScript is a non-Turing-complete functional language executing in the eUTXO model.

For agent payments, non-Turing-completeness is an advantage:
- Scripts terminate in provably finite time — no infinite loops
- Gas estimation is exact — no surprises
- Formal verification is tractable
- Script logic is embedded in the UTxO — no external contract address needed

## Babel Fees — solving the bootstrapping problem

Every blockchain with a native gas token has the same problem:
every new participant needs to acquire the native token before they can transact.

For ephemeral agents, this is a critical failure:
- Agent A is paid in a community token
- Agent A wants to pay Agent B
- Agent A has no ERG
- Agent A can't submit the transaction
- Deadlock

Ergo solves this at the protocol level with Babel Fees:
- Miners create "Babel boxes" offering ERG in exchange for tokens at a fixed rate
- Agents include a Babel box reference in their transaction
- Miners who include the transaction receive ERG from the Babel box
- Agent pays fees in whatever token they hold

No wrapper contracts. No DEX dependency. On-chain, trustless, miner-incentive-aligned.

## Proof-of-Work: the governance argument

For agent infrastructure, the governance risk is underappreciated.

Proof-of-Stake systems can coordinate through validator multisigs.
Smart contract platforms have foundation emergency powers.
These mechanisms have been used: The DAO hack (Ethereum hard fork), Tornado Cash sanctions
(validator compliance), Solana network halts (validator coordination).

Agents operating on these chains inherit governance risk.
A regulatory order to pause a validator set pauses your agent infrastructure.

Ergo's GPU Proof-of-Work has no equivalent coordination surface:
- No foundation multisig over the protocol
- No validator committee that can be compelled
- No emergency hard fork history
- No smart contract pause mechanisms

For autonomous agent infrastructure, this is a protocol property — not just ideology.
