# ACCORD-004 — Accord/402 transport

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`@accord-protocol/gateway`](../packages/accord-gateway/) |

## 1. Purpose

Accord/402 is the HTTP transport for Accord engagements. It extends the standard HTTP `402 Payment Required` shape with Accord-specific request and response headers + a structured 402-challenge body that gives the buyer enough information to construct an [`accord.agreement.v0`](./ACCORD-001-agreement-object.md), pay, and retry.

The point: an existing HTTP API can become Accord/402-conformant by adding ONE middleware. The seller does not need to expose a separate Accord/MCP endpoint — Accord/402 lives on the same `/api/run` (or whatever path) as the unauthenticated probe.

## 2. Request: from buyer to seller

A buyer attaches three headers (only the first two are required):

```http
POST /api/run HTTP/1.1
Host: provider.example
Content-Type: application/json

X-Accord-Agreement-Id: acc_01HX0000000000000000000000
X-Accord-Payment: <JSON-encoded rail-specific payment proof>
X-Accord-Task-Output: <optional, raw bytes the buyer pre-committed to>
```

| Header | Required | What it carries |
|---|---|---|
| `X-Accord-Agreement-Id` | yes | The `agreement_id` of an Agreement Object the seller can resolve. |
| `X-Accord-Payment` | yes | A rail-specific payment proof, JSON-encoded. The seller's rail adapter inspects this. |
| `X-Accord-Task-Output` | no | The raw bytes the buyer pre-committed to. When present, the gateway hashes them and matches against `agreement.task.output_hash` if that field was set. |

Header names are case-insensitive on the wire (per RFC 7230). The lower-case form is canonical in Accord docs.

The HTTP body is whatever the underlying API expects. Accord/402 does not specify body shape — it's the seller's responsibility.

## 3. Response: 402 challenge

When a request lacks Accord-* headers (or the agreement-id can't be resolved), the seller responds:

```http
HTTP/1.1 402 Payment Required
Accord-Version: v0
Accord-Agreement-Required: true
Accord-Agreement-Template: https://provider.example/.well-known/accord/agreement-template
Accord-Accepted-Rails: ergo,rosen,base,x402
WWW-Authenticate: Accord402
Content-Type: application/json
```

| Response header | Required | Value |
|---|---|---|
| `Accord-Version` | yes | `v0` |
| `Accord-Agreement-Required` | yes | `true` |
| `Accord-Agreement-Template` | yes | URL to a JSON resource describing how to build the Agreement |
| `Accord-Accepted-Rails` | yes | Comma-separated list of supported rails |
| `WWW-Authenticate` | yes | `Accord402` (the auth-scheme name; standard HTTP authentication-challenge slot) |

### 3.1 Body

```json
{
  "error": "ACCORD_PAYMENT_REQUIRED",
  "message": "Accord agreement-id required. Construct an Agreement and retry.",
  "agreement_template": "https://provider.example/.well-known/accord/agreement-template",
  "price": { "amount": "0.05", "currency": "USDC", "decimals": 6 },
  "accepted_rails": ["ergo", "rosen", "base", "x402"],
  "verification_required": false
}
```

Required fields: `error`, `agreement_template`, `price`, `accepted_rails`, `verification_required`. Sellers may add additional fields under their own namespace; consumers MUST ignore unknown fields they don't recognise.

## 4. Response: 200 success

When all checks pass:

```http
HTTP/1.1 200 OK
Accord-Version: v0
X-Accord-Agreement-Hash: blake2b256:0x<64 hex>
X-Accord-Verification-Receipt-Hash: blake2b256:0x<64 hex>
X-Accord-Settlement-Receipt-Hash: blake2b256:0x<64 hex>
Content-Type: application/json
```

```json
{
  "output": <whatever the handler returned>,
  "_meta": {
    "accord_agreement_id": "acc_…",
    "accord_agreement_hash": "blake2b256:0x…",
    "accord_verification_receipt": { … } ,    // present when verification.required
    "accord_settlement_receipt": { … },        // present when rail.settle was attempted
    "accord_settlement_attempted": true
  }
}
```

The receipt-hash response headers are a fast-path for clients that don't want to parse the body. The full receipts are in `_meta`.

## 5. Replay protection

The seller derives a `payment_id` from the rail's `verifyPayment` response and rejects the second use of the same id within a TTL window. The default reference implementation uses a 24-hour TTL and an in-memory store; production deployments SHOULD plug in Redis or equivalent.

When a replay is detected:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```json
{
  "error": "REPLAY_DETECTED",
  "rail": "ergo",
  "accord_agreement_id": "acc_…",
  "message": "payment_id was already claimed in the past TTL window"
}
```

## 6. Error taxonomy

The seller emits structured 4xx / 5xx responses with a JSON body that carries an `error` code. The reference implementation uses these codes ([`@accord-protocol/gateway`](../packages/accord-gateway/) `ACCORD_GATEWAY_ERROR_CODES`):

| Code | HTTP | Meaning |
|---|---|---|
| `ACCORD_PAYMENT_REQUIRED` | 402 | No Accord-* headers; 402 challenge body returned |
| `UNKNOWN_AGREEMENT` | 402 | Agreement-id not resolvable |
| `MISSING_PAYMENT` | 402 | Agreement resolved but `X-Accord-Payment` missing |
| `AGREEMENT_INVALID` | 400 | Resolved agreement fails cross-field validation |
| `PAYMENT_VERIFICATION_FAILED` | 402 | Rail's `verifyPayment` returned `ok: false` |
| `RAIL_UNAVAILABLE` | 502 | Rail's `verifyPayment` threw |
| `REPLAY_DETECTED` | 402 | `payment_id` already claimed |
| `TASK_OUTPUT_HASH_MISMATCH` | 400 | Pre-committed task-output hash mismatch |
| `HANDLER_THREW` | 500 | Seller's handler threw |
| `VERIFICATION_REQUIRED` | 422 | `verification.required = true` but no verifier configured |
| `VERIFICATION_REJECTED` | 422 | Verifier rejected, or returned an invalid receipt |

Conformant implementations MUST emit codes from this set when those conditions occur. Additional codes are allowed for implementation-specific failures.

## 7. Optional: `/.well-known/accord` discovery

A seller MAY publish a discovery document at `/.well-known/accord` describing the services it offers:

```json
{
  "type": "accord.provider.v0",
  "provider_id": "provider://example",
  "name": "Example Provider",
  "transports": ["accord/402", "accord/mcp"],
  "accepted_rails": ["ergo", "rosen", "base", "x402"],
  "services": [
    {
      "service_id": "repo_audit_v0",
      "task_kind": "repo_audit",
      "endpoint": "https://provider.example/api/run",
      "price": { "amount": "25", "currency": "ERG", "decimals": 9 },
      "verification": { "required": true, "accepted_methods": ["verifier_receipt"] }
    }
  ]
}
```

This is a hint, not a contract — the on-the-wire 402 response is authoritative.

## 8. x402 compatibility

Accord/402 is a strict superset of the request/response shape that an x402 buyer expects. A seller running `@accord-protocol/gateway` PLUS `@accord-protocol/rails-x402` accepts an x402 buyer's payload directly: the buyer sends `X-Accord-Payment: <base64-encoded x402 PaymentPayload>`, the rail-x402 adapter forwards the payload to the buyer's chosen facilitator, and the seller emits an Accord Settlement Receipt (`mode: paid_before_response`) on top.

This is the *"Accord upgrades x402 endpoints into agreements"* contract from the master plan.

## 9. Conformance

A v0-conformant Accord/402 endpoint MUST:

1. Return 402 with the documented response headers when no Accord-* headers are present.
2. Return 402 with `body.error` ∈ {`MISSING_PAYMENT`, `UNKNOWN_AGREEMENT`} when `X-Accord-Agreement-Id` is supplied but `X-Accord-Payment` is not.
3. Return 200 with `X-Accord-Agreement-Hash` (matching `blake2b256(canonical(agreement))`) and a body containing `_meta.accord_agreement_id` when both Accord-* headers are valid.
4. Reject the second use of the same `payment_id` within a TTL window (`REPLAY_DETECTED`).
5. Return 422 with `VERIFICATION_REJECTED` when the verifier rejects the seller's output.

The conformance suite (`@accord-protocol/conformance`, level L1 in network mode) probes these requirements against a live endpoint via `--target <url>`. See [ACCORD-009](./ACCORD-009-conformance.md).

## 10. Reference implementation

[`@accord-protocol/gateway`](../packages/accord-gateway/). 16 unit tests covering the full flow including replay protection. Drops into any Connect/Express-style HTTP framework.

## 11. Open questions (v1 candidates)

- **Streaming responses.** Pay-per-token APIs need a way to issue micro-receipts mid-stream. v0 emits one Settlement Receipt per request; v1 may add `accord.settlement_stream.v1`.
- **Range / partial settlement.** When the seller can't fully satisfy the request, partial settlement (`mode: partial`) is currently driven by the verifier's `result: "partial"` only. v1 may add explicit partial-settlement headers.
- **Caching of agreement templates.** Today the buyer fetches the template every 402; a `Cache-Control` story would reduce traffic.
