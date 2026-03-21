# ergo-agent-pay — API Reference

TypeScript SDK for autonomous AI agent payments on Ergo.

```bash
npm install ergo-agent-pay
```

---

## ErgoAgentPay

Main class. All methods build EIP-12 unsigned transactions, sign if a `signer` is configured,
and submit if signing succeeds.

### Constructor

```typescript
import { ErgoAgentPay } from "ergo-agent-pay"

const agent = new ErgoAgentPay(config: ErgoAgentPayConfig)
```

**`ErgoAgentPayConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | ✅ | Ergo address of the agent |
| `network` | `"mainnet" \| "testnet"` | — | Default: `"mainnet"` |
| `signer` | `SignerFn` | — | `(unsignedTx) => Promise<SignedTx>`. If omitted, returns unsigned TX |
| `policy` | `PolicyConfig` | — | Spend limits and approval hooks |
| `nodeUrl` | `string` | — | Custom API node URL. Defaults to public Ergo API |

---

### `pay(to, amount, opts?)`

Send ERG to an address.

```typescript
const result = await agent.pay(receiverAddress, "0.005 ERG")
const result = await agent.pay(receiverAddress, 5_000_000n)          // nanoERG
const result = await agent.pay(receiverAddress, "0.005 ERG", {
  memo: "payment for API call #1234",
})
```

**Parameters**
- `to: string` — receiver address
- `amount: bigint | string | number` — nanoERG, or `"N ERG"` string
- `opts?: PayOptions` — `{ memo?, script? }`

**Returns: `Promise<PayResult>`**

| Field | Type | Description |
|---|---|---|
| `unsignedTx` | `EIP12UnsignedTx` | Always present |
| `signedTx` | `SignedTx?` | Present if signer configured |
| `txId` | `string?` | Present if submitted |
| `submitted` | `boolean` | Whether TX was submitted |

---

### `issueNote(opts)`

Issue a programmable bearer Note — a payment instrument for multi-agent flows.

```typescript
const result = await agent.issueNote({
  recipient:    receiverAddress,
  value:        "0.01 ERG",
  reserveBoxId: "abc123...",
  deadline:     "+100 blocks",   // or absolute block height: 1_200_000
  taskHash:     "deadbeef...",   // 32-byte hex — acceptance predicate
})
```

**Parameters (`NoteOptions`)**

| Field | Type | Required | Description |
|---|---|---|---|
| `recipient` | `string` | ✅ | Receiver address |
| `value` | `bigint \| string \| number` | ✅ | Note face value |
| `reserveBoxId` | `string` | ✅ | Reserve UTxO backing this Note |
| `deadline` | `number \| "+N blocks"` | ✅ | Expiry block height or relative offset |
| `taskHash` | `string` | — | 32-byte hex — acceptance predicate (R6) |
| `credentialKey` | `string` | — | GroupElement hex — credential gate (R7) |

**Returns: `Promise<NoteResult>`** — extends `PayResult` with `noteOutput` summary.

---

### `checkNote(noteBoxId)` _(v0.2.0)_

Fetch a Note from the blockchain and decode its registers.

```typescript
const note = await agent.checkNote("abc123...")
console.log(note.isExpired)    // boolean
console.log(note.expiryBlock)  // number
console.log(note.taskHash)     // string | undefined
console.log(note.valueErg)     // "0.01" — human readable
```

**Returns: `Promise<NoteInfo>`**

| Field | Type | Description |
|---|---|---|
| `boxId` | `string` | Note box ID |
| `value` | `bigint` | Face value in nanoERG |
| `ergs` | `string` | Human-readable ERG amount |
| `expiryBlock` | `number` | Block height from R5 |
| `currentBlock` | `number` | Chain height at query time |
| `isExpired` | `boolean` | Whether `HEIGHT >= expiryBlock` |
| `reserveBoxId` | `string?` | R4 decoded (hex) |
| `taskHash` | `string?` | R6 decoded (hex, 32 bytes) |
| `credentialKey` | `string?` | R7 decoded (hex) |
| `raw` | `unknown` | Raw box object from API |

---

### `redeemNote(opts)` _(v0.2.0)_

Spend a Note and release its ERG to the receiver.

```typescript
const result = await agent.redeemNote({
  noteBoxId:       "abc123...",
  receiverAddress: myAddress,        // defaults to agent address
  taskOutput:      "task result",    // for acceptance predicate Notes
})
```

**Parameters (`RedeemOptions`)**

| Field | Type | Required | Description |
|---|---|---|---|
| `noteBoxId` | `string` | ✅ | Box ID of the Note to redeem |
| `receiverAddress` | `string` | — | Defaults to agent address |
| `taskOutput` | `Uint8Array \| Buffer \| string` | — | Required for taskHash Notes. Injected as context var 0 |

**Returns: `Promise<RedeemResult>`** — includes `redeemed.value` and `redeemed.receiver`.

---

### `createReserve(config)` _(v0.2.0)_

Deploy a Reserve collateral box — the backing for a Note issuance system.

```typescript
const result = await agent.createReserve({
  collateral:    "1 ERG",
  memo:          "agent-reserve-v1",
  scriptErgoTree: compiledScript,    // omit for P2PK (dev only)
})
```

**Parameters (`ReserveConfig`)**

| Field | Type | Required | Description |
|---|---|---|---|
| `collateral` | `bigint \| string \| number` | ✅ | ERG locked as backing |
| `scriptErgoTree` | `string` | — | Compiled reserve script (production). Omit for P2PK dev mode |
| `memo` | `string` | — | Stored in R4 |

**Returns: `Promise<ReserveResult>`** — includes `reserve.value`, `reserve.hasScript`.

---

### `deployTracker(config)` _(v0.2.0)_

Deploy the anti-double-spend Tracker box with an empty spent set.

```typescript
const result = await agent.deployTracker({
  scriptErgoTree: compiledTrackerScript,
})
```

**Returns: `Promise<TrackerResult>`**

---

### `settleBatch(opts)` _(v0.2.0)_

Redeem multiple Notes in a single transaction.

```typescript
const result = await agent.settleBatch({
  noteBoxIds: ["abc...", "def...", "ghi..."],
  receiverAddress: myAddress,
  taskOutputs: {
    "abc...": "output for abc",
    "def...": Buffer.from([...]),
  },
})

console.log(result.settlement.noteCount)   // 3
console.log(result.settlement.totalValue)  // total nanoERG
```

**Returns: `Promise<BatchSettleResult>`** — includes `settlement.noteCount`, `settlement.totalValue`, `settlement.receiver`.

---

## Policy Engine

Configure spend limits and approval hooks on the `ErgoAgentPay` constructor.

```typescript
const agent = new ErgoAgentPay({
  address: myAddress,
  policy: {
    maxSinglePayment:   5_000_000n,   // 0.005 ERG max per TX
    maxSessionSpend:    50_000_000n,  // 0.05 ERG max per session
    requireApprovalAbove: 10_000_000n,
    approvalFn: async (ctx) => {
      console.log(`Approve payment of ${ctx.value} nanoERG to ${ctx.to}?`)
      return true // your custom logic
    },
    beforePay: async (ctx) => {
      return ctx.to !== BLACKLISTED_ADDRESS  // false = reject
    },
    afterPay: async (ctx, result) => {
      console.log("Payment complete:", result.txId)
    },
  }
})
```

**`PolicyConfig`**

| Field | Type | Description |
|---|---|---|
| `maxSinglePayment` | `bigint` | Reject payments above this amount |
| `maxSessionSpend` | `bigint` | Reject if cumulative spend would exceed |
| `requireApprovalAbove` | `bigint` | Call `approvalFn` for large payments |
| `approvalFn` | `ApprovalFn` | `(ctx) => boolean \| Promise<boolean>` |
| `beforePay` | `BeforePayHook` | Called before every TX. Return `false` to reject |
| `afterPay` | `AfterPayHook` | Called after every successful TX |

---

## LangChain adapter

```typescript
const tool = agent.asLangChainTool()
// Returns a DynamicStructuredTool with name "ergo_pay"

const tools = [tool]
// Use in AgentExecutor, create_openai_functions_agent, etc.
```

---

## OpenAI function calling

```typescript
const { definition, handler } = agent.asOpenAIFunction()

// Pass to OpenAI API:
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools: [{ type: "function", function: definition }],
})

// Handle tool call:
if (completion.choices[0].message.tool_calls) {
  const args = JSON.parse(completion.choices[0].message.tool_calls[0].function.arguments)
  const result = await handler(args)
}
```

---

## Lifecycle builder functions (advanced)

For custom signing flows, import the builders directly:

```typescript
import {
  buildCreateReserveTx,
  buildRedeemNoteTx,
  buildBatchSettleTx,
  buildDeployTrackerTx,
  decodeRegisterInt,
  decodeRegisterBytes,
} from "ergo-agent-pay"
```

Each returns an `EIP12UnsignedTx` — sign externally (Nautilus, Ledger, server key) and submit
to `POST https://api.ergoplatform.com/api/v1/transactions`.

---

## Error handling

```typescript
import { ErgoAgentPayError } from "ergo-agent-pay"

try {
  await agent.pay(address, "1000 ERG")
} catch (err) {
  if (err instanceof ErgoAgentPayError) {
    switch (err.code) {
      case "INSUFFICIENT_FUNDS":  // ...
      case "POLICY_REJECTED":     // maxSinglePayment or beforePay returned false
      case "APPROVAL_DENIED":     // approvalFn returned false
      case "NOTE_EXPIRED":        // Note past expiryBlock
      case "BOX_NOT_FOUND":       // noteBoxId not on chain
    }
  }
}
```

**All error codes:** `INSUFFICIENT_FUNDS` | `POLICY_REJECTED` | `APPROVAL_DENIED` | `NO_SIGNER` | `NETWORK_ERROR` | `INVALID_ADDRESS` | `INVALID_AMOUNT` | `INVALID_HASH` | `SUBMISSION_FAILED` | `BOX_NOT_FOUND` | `NOTE_EXPIRED` | `NOTE_INVALID`

---

## Register encoding reference

| Register | Type | Encoding | Usage |
|---|---|---|---|
| R4 | `SColl[SByte]` | `0e` + length + bytes | Reserve box ID |
| R5 | `SInt` | `04` + zigzag(height) | Expiry block height |
| R6 | `SColl[SByte]` | `0e` + length + bytes | Task hash (32 bytes) |
| R7 | `SColl[SByte]` | `0e` + length + bytes | Credential public key |

Context variable 0 (acceptance predicate): `0e{lenHex}{taskBytesHex}` in `inputs[i].extension`.
