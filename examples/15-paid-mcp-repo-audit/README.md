# 15 — Paid MCP repo-audit demo

The **one-command** Accord Protocol demo. End-to-end Accord lifecycle in under 10 minutes:

```text
1. Buyer creates an Accord Agreement
2. Buyer pays via the Mock rail
3. Seller's MCP wrapper validates the Agreement and verifies payment
4. Seller's handler runs (deterministic stand-in for a real repo audit)
5. Verifier inspects the output and signs a Verification Receipt
6. Mock rail emits a Settlement Receipt
7. Buyer receives the output + both receipts in a structured AccordMcpResult
```

Hard rule: **no manual NOTE_BOX_ID copy/paste, no placeholder steps**. The demo is fully self-contained — the rail is mocked in-process so you can see the lifecycle without standing up an Ergo node, an x402 facilitator, or a Base RPC.

## Run it

```bash
cd examples/15-paid-mcp-repo-audit
npm install        # installs @accord-protocol/* from this monorepo's workspaces
npm run dev        # runs the demo
```

Output:

```text
Accord Protocol — paid MCP repo-audit demo

  ✓ Agreement created       acc_01HX0DEMO00000000000000000
     agreement_hash         blake2b256:0x…
  ✓ Mock-rail payment       accepted
  ✓ Tool ran                2 finding(s)
  ✓ Verification Receipt    vr_…
  ✓ Settlement Receipt      sr_…

Output:
{
  "schema": "accord.audit_report.v0",
  "repo_url": "https://github.com/accord-protocol/accord-protocol",
  "findings": [ … ]
}
```

Override the audited repo URL:

```bash
npm run dev -- --repo https://github.com/your-org/your-repo
```

## What it shows

- **Agreement Object construction** (`common/agreement.ts`) — every field that a buyer-supplied Agreement carries: buyer/seller identities, task spec, price, payment-rail config, verification rules, settlement terms.
- **Paywalled MCP wrapper** (`seller/tool.ts`) — `wrapAccordMcp` from `@accord-protocol/mcp` plumbs the rail + verifier + handler. The same wrapper that ships in production.
- **Verifier hook** (`verifier/sign.ts`) — receives the Agreement + the seller's output, runs the `evidence_required` checks, signs a v0 Verification Receipt.
- **Mock rail adapter** (`common/mock-rail.ts`) — implements `AccordRailAdapter` from `@accord-protocol/rails`. Same shape as the real rails (`rails-ergo`, `rails-base`, etc.); swap with one line to point at testnet.
- **End-to-end driver** (`buyer/run.ts`) — orchestrates the pieces in-process so the lifecycle is visible at a glance.

## What's mocked vs real

| Layer | Status |
|---|---|
| `@accord-protocol/core` (canonicalize / hash / validate) | **Real** |
| `@accord-protocol/mcp` (wrapAccordMcp) | **Real** — the production wrapper |
| `@accord-protocol/rails` (AccordRailAdapter interface) | **Real** |
| Verifier signature | **Real schema, mock keys** — replace with libsodium / secp256k1 binding for production |
| Rail (payment + settlement) | **Mock** — replace with `createErgoRailAdapter` / `createBaseRailAdapter` / `createX402RailAdapter` |
| Agreement storage | **In-memory** — Postgres / Redis in production |
| MCP server framework | **None** — `wrapAccordMcp` returns a callable, the demo invokes it directly. Wire `@modelcontextprotocol/sdk` to expose it as an MCP tool. |

## Tests

```bash
npm test
```

Three tests:
- The lifecycle completes end-to-end (`ok: true`, both receipts present).
- The seller's handler returns a structured `AuditReport` (`schema`, `findings[]`).
- Two runs with different agreement_ids produce different agreement_hashes.

## How to plug a real rail

Replace one import:

```ts
// before
import { demoRail } from "../common/mock-rail.js";

// after — Ergo Note rail
import { ErgoAgentPay } from "ergo-agent-pay";
import { createErgoRailAdapter } from "@accord-protocol/rails-ergo";
const rail = createErgoRailAdapter({
  ops: new ErgoAgentPay({ address, network: "testnet", signer }),
});
```

The buyer's `accord_payment` shape changes from `{ value: "0.001" }` to `{ note_box_id, task_output, receiver_address? }` — see `@accord-protocol/rails-ergo`'s README for the exact wire shape.

## License

MIT.
