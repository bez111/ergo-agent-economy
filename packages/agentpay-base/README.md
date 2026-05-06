# agentpay-base

**Base / Ethereum-L2 implementation of the AgentPay v0 protocol.**

Reserve / Note / Acceptance Predicate semantics on EVM, denominated in
any ERC-20 (USDC, USDT, …). Mirrors the
[`ergo-agent-pay`](../ergo-agent-pay) API shape so apps pick the chain
by config, not by rewriting.

This package is a sibling of the Ergo SDK. Same SPEC, same protocol,
different settlement chain. Existing audit gate, manifest, and safety
guardrails are mirrored 1:1 with EVM-flavoured names
(`AUDITED_CONTRACTS.json` instead of `AUDITED_ERGOTREES.json`,
keccak256 instead of BLAKE2b-256).

## Why this exists

Most agentic-payment infrastructure being built today targets Base /
Ethereum L2s with USDC. Ergo has the better protocol primitives for
agent credit, but USDC sits on Base. This package gives integrators
the option of native Base settlement when they don't want or need a
bridge.

## What it does

* Holds USDC (or any ERC-20) in a reserve, indexed by issuer address.
* Issues Notes — programmable IOUs with expiry + acceptance predicate.
* Verifies the predicate inline at redemption (`keccak256(taskOutput)
  == note.taskHash`).
* Refunds the issuer's reserve from expired Notes.
* Exposes an audit gate that refuses mainnet writes unless the deployed
  contract's runtime bytecode hash appears in
  `data/AUDITED_CONTRACTS.json` with `mainnetAllowed: true`.

## What it does NOT do

* Deploy the contract for you. Use Foundry / Hardhat / a wallet UI;
  the contract source is in [`contracts/AgentPayReserveV0.sol`](./contracts/AgentPayReserveV0.sol).
* Wrap your private key. Use a viem `WalletClient` you own.
* Sign or submit cross-chain bridge transactions. For that, use
  [`ergo-agent-rosen`](../ergo-agent-rosen).

## Install

```bash
npm install agentpay-base viem
```

## Quick start

```ts
import { createPublicClient, createWalletClient, http } from "viem"
import { baseSepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { BaseAgentPay, computeTaskHash } from "agentpay-base"

const account = privateKeyToAccount(process.env.AGENT_PK!)
const transport = http(process.env.BASE_SEPOLIA_RPC)

const publicClient = createPublicClient({ chain: baseSepolia, transport })
const walletClient = createWalletClient({ account, chain: baseSepolia, transport })

const base = new BaseAgentPay({
  address: account.address,
  network: "base-sepolia",
  reserveContract: "0x...AgentPayReserveV0",
  tokenContract:   "0x...USDC",
  publicClient,
  walletClient,
})

// Top up reserve once
await base.topUp(10_000_000n) // 10 USDC

// Issue a Note
const { noteId } = await base.issueNote({
  recipient:  "0x...recipient",
  amount:     5_000_000n,                    // 5 USDC
  expiry:     "+1000 blocks",
  taskHash:   computeTaskHash("the answer is 42"),
})

// Recipient redeems (must be msg.sender)
await base.redeemNote(noteId, "the answer is 42")

// Or, after expiry, the issuer recovers their funds
await base.refundExpired(noteId)
```

## How this differs from `ergo-agent-pay`

| Aspect | Ergo (`ergo-agent-pay`) | Base (`agentpay-base`) |
|---|---|---|
| Hash function | BLAKE2b-256 | keccak256 |
| Receiver binding | optional (credential_v0); task_hash_v0 is front-run-able | **built in via msg.sender == recipient** |
| Audit unit | compiled ergoTree hex | deployed runtime bytecode keccak256 |
| Tracker | separate Tracker box | implicit (`redeemed` bool in Note struct) |
| Refund | leave Note to expire | explicit `refundExpired` call |
| Currency | ERG (volatile) or rsUSDT via Rosen | USDC / USDT directly |
| Settlement latency | ~2 min (Ergo block time) | <2s (Base block time) |
| Gas cost | ~0.001 ERG | varies, typically <$0.01 USDC equivalent on Base |

## API

```ts
class BaseAgentPay {
  constructor(config: BaseAgentPayConfig)

  // reads
  getReserveBalance(): Promise<bigint>
  getTokenBalance(): Promise<bigint>
  getTokenDecimals(): Promise<number>
  getBlockNumber(): Promise<bigint>
  checkNote(noteId: Hex): Promise<NoteInfo>

  // writes (require walletClient)
  topUp(amount: bigint): Promise<{ approveTxHash, topUpTxHash }>
  withdraw(amount: bigint): Promise<{ txHash }>
  issueNote(opts: NoteOptions): Promise<{ noteId, txHash }>
  redeemNote(noteId: Hex, taskOutput?: string | Uint8Array): Promise<{ txHash }>
  refundExpired(noteId: Hex): Promise<{ txHash }>
}

// Helpers
computeTaskHash(input: string | Uint8Array): Hex   // keccak256
NO_TASK_HASH: Hex                                  // bytes32(0)
asTaskHash(value: string): Hex                     // validate + cast
verifyAuditedContract({ client, network, address, requireMainnet? })
```

## Audit gate

Every mainnet operation calls `assertProductionSafety` first. Without
an `auditPolicy` configured, mainnet writes are refused with
`UNAUDITED_CONTRACT`. Wire the policy with the audit manifest:

```ts
import { verifyAuditedContract } from "agentpay-base"

const base = new BaseAgentPay({
  // …
  auditPolicy: async (bytecodeHash, network) => {
    const v = await verifyAuditedContract({
      client: publicClient,
      network,
      address: reserveAddress,
      requireMainnet: true,
    })
    return v.ok ? { ok: true } : { ok: false, reason: v.message ?? "unaudited" }
  },
})
```

The manifest at [`data/AUDITED_CONTRACTS.json`](./data/AUDITED_CONTRACTS.json)
is empty in `draft-pre-audit` state. **Mainnet remains blocked until
an external auditor signs a populated manifest.** Ergo and Base share
the same overall release process — see the project's
[`SECURITY.md`](../../SECURITY.md).

## Status

`NOT CERTIFIED FOR MAINNET`. The Solidity contract has not been
externally audited. Deploy on Base Sepolia for development; build the
audit story before promoting.

## Roadmap

| Item | Status |
|---|---|
| Solidity contract — Reserve / Note / refund / audit gate | ✅ this PR |
| TypeScript adapter — viem-based, mirrors ergo-agent-pay | ✅ this PR |
| Audit manifest scaffold | ✅ this PR |
| 49 mock-based unit tests (encoding, audit gate, adapter) | ✅ this PR |
| Hardhat / Foundry deployment scripts | next PR |
| On-chain integration tests (anvil + viem testClient) | next PR |
| External auditor sign-off | requires human |
