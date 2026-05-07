# ACCORD-005 — Accord/MCP transport

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`@accord-protocol/mcp`](../packages/accord-mcp/) |

## 1. Purpose

Accord/MCP is the [Model Context Protocol](https://modelcontextprotocol.io/) transport for Accord engagements. It turns any MCP tool into a paid, verifiable Accord engagement by injecting three input fields into the tool's schema and wrapping the handler in a paywall + verification + settlement pipeline.

The point: an existing MCP tool can become Accord/MCP-conformant with one wrapper call. The MCP server framework, transport (stdio / WebSocket / HTTP), and tool registration plumbing are unchanged.

## 2. Tool input fields

A conformant Accord/MCP tool's `inputSchema.properties` includes three reserved fields:

```json
{
  "type": "object",
  "properties": {
    "accord_agreement_id": {
      "type": "string",
      "description": "ULID-shaped Accord Agreement id (acc_*)."
    },
    "accord_payment": {
      "description": "Rail-specific payment proof (opaque to the wrapper)."
    },
    "accord_task_output": {
      "description": "Optional pre-committed task output. If set, its accord_hash_v0 must match agreement.task.output_hash."
    }
  },
  "required": ["accord_agreement_id", "accord_payment"]
}
```

Tools with their own argument schema add these alongside; the wrapper merges them automatically.

## 3. Tool result shape

### 3.1 Success

```json
{
  "content": [{ "type": "text", "text": "<handler output rendered>" }],
  "output": <whatever the handler returned>,
  "_meta": {
    "accord_agreement_id": "acc_…",
    "accord_agreement_hash": "blake2b256:0x…",
    "accord_verification_receipt": { … },     // present when verification.required
    "accord_settlement_receipt": { … }         // present when rail.settle was attempted
  }
}
```

### 3.2 Error

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "<error code>: <human message>" }],
  "_meta": {
    "accord_error_code": "<one of the codes below>",
    "accord_agreement_id": "<when known>",
    "<additional context>": "..."
  }
}
```

The wrapper **returns** structured errors instead of throwing. This is the MCP convention — clients are easier to wire when errors flow as result values.

## 4. Per-call lifecycle

For each tool call, a conformant Accord/MCP wrapper:

1. Pulls `accord_agreement_id` / `accord_payment` / `accord_task_output` from the args.
2. Resolves the agreement via the seller-supplied `resolveAgreement(id)` callback.
3. Runs `validateAgreement` (cross-field rules from ACCORD-001 §7).
4. Calls `rail.verifyPayment({ agreement, payment })`.
5. (Optional) Hashes `accord_task_output` and compares against `agreement.task.output_hash`.
6. Runs the seller's handler with the **non-Accord** args + the resolved Agreement.
7. (If `agreement.verification.required`) calls the configured verifier; runs `validateVerificationReceipt(receipt, { agreement })`; rejects if `result == "rejected"`.
8. (Best-effort) calls `rail.settle(...)`. Failure here does NOT reject the call — the buyer already got the work; receipts are reconciled out of band.
9. Returns the handler's output with `_meta.accord_*` annotations.

## 5. Error taxonomy

The wrapper surfaces errors via `_meta.accord_error_code`. Conformant implementations MUST emit codes from this set ([`@accord-protocol/mcp`](../packages/accord-mcp/) `ACCORD_MCP_ERROR_CODES`):

| Code | When |
|---|---|
| `MISSING_AGREEMENT_ID` | Buyer didn't include `accord_agreement_id` |
| `MISSING_PAYMENT` | Buyer didn't include `accord_payment` |
| `UNKNOWN_AGREEMENT` | `resolveAgreement(id)` returned undefined or threw |
| `AGREEMENT_INVALID` | `validateAgreement` rejected (cross-field rules) |
| `PAYMENT_VERIFICATION_FAILED` | Rail returned `{ ok: false }` |
| `RAIL_UNAVAILABLE` | Rail's `verifyPayment` threw |
| `TASK_OUTPUT_HASH_MISMATCH` | `accord_task_output` hash ≠ `agreement.task.output_hash` |
| `HANDLER_THREW` | Seller's handler threw |
| `VERIFICATION_REQUIRED` | `verification.required: true` but no verifier configured |
| `VERIFICATION_REJECTED` | Verifier rejected, or returned an invalid receipt |

## 6. Conformance probing

The conformance suite probes Accord/MCP via stdio JSON-RPC ([ACCORD-009](./ACCORD-009-conformance.md), L1 network mode):

1. `initialize` — server returns `protocolVersion`
2. `tools/list` — at least one tool's `inputSchema` declares `accord_agreement_id` + `accord_payment`
3. `tools/call` without `accord_agreement_id` → `_meta.accord_error_code == MISSING_AGREEMENT_ID`
4. `tools/call` with agreement-id but no payment → `_meta.accord_error_code ∈ {MISSING_PAYMENT, UNKNOWN_AGREEMENT}`

## 7. Reference implementation

[`@accord-protocol/mcp`](../packages/accord-mcp/) — `wrapAccordMcp` factory. 18 unit tests covering every error code + happy paths. Framework-agnostic: returns a callable, plug into any MCP server runtime (`@modelcontextprotocol/sdk`, custom, etc.).

## 8. Open questions (v1 candidates)

- **Resource subscriptions.** MCP resources are persistent objects; v0 only paywalls one-shot tool calls.
- **Streaming tool responses.** Same gap as ACCORD-004.
- **Sampling delegation.** When the tool calls back to the host LLM (sampling), the cost should be attributable to the same engagement.
