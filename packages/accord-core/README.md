# `@accord-protocol/core`

Core SDK for [Accord Protocol](https://github.com/bez111/accord-protocol). Canonicalize, hash, and validate the three v0 protocol objects:

| Object | Spec | Type literal |
|---|---|---|
| Agreement | [ACCORD-001](../../specs/ACCORD-001-agreement-object.md) | `accord.agreement.v0` |
| Verification Receipt | [ACCORD-002](../../specs/ACCORD-002-verification-receipt.md) | `accord.verification_receipt.v0` |
| Settlement Receipt | [ACCORD-003](../../specs/ACCORD-003-settlement-receipt.md) | `accord.settlement_receipt.v0` |

This package is **rail-agnostic**. It knows nothing about Ergo, Base, Rosen, or x402 — those live in `@accord-protocol/rails-*` adapters.

## Install

```bash
npm install @accord-protocol/core
```

## Usage

### Hashing

```ts
import { accordHashV0, withPrefix } from "@accord-protocol/core";

const agreement = { /* …matches schemas/agreement.v0.schema.json… */ };
const hex   = accordHashV0(agreement);          // "a1b2c3…"  (64 lower-case hex)
const wire  = withPrefix(hex);                  // "blake2b256:0xa1b2c3…"
```

`accord_hash_v0 = BLAKE2b-256(canonical_json_bytes(object))`. The wire form (`blake2b256:0x…`) is what `agreement_hash` / `verification_receipts[i]` carry inside protocol objects.

### Signing a Verification Receipt

The signing input is the receipt with the `signature` field stripped, canonicalized, then BLAKE2b-256-hashed:

```ts
import { signingHashRaw } from "@accord-protocol/core";

const signingInput = signingHashRaw(receipt);  // 32-byte digest
const signature = sign(privateKey, signingInput);
receipt.signature = { scheme: "ed25519", public_key, signature };
```

### Validating

```ts
import {
  validateAgreement,
  validateVerificationReceipt,
  validateSettlementReceipt,
} from "@accord-protocol/core";

const r = validateAgreement(agreement);
if (!r.ok) {
  for (const p of r.problems) console.error(p.code, p.path, p.message);
}
```

Validation enforces the **cross-field rules** that JSON Schema can't easily express — see [`src/validate.ts`](./src/validate.ts) for the full list. Use it alongside JSON-Schema validation against [`schemas/`](../../schemas), not instead of it.

### Per-rail mode allow-list

```ts
import { RAIL_MODE_ALLOWLIST } from "@accord-protocol/core";

RAIL_MODE_ALLOWLIST.ergo
// → ["note_redeemed", "reserve_refunded", "batch_settled"]
```

## What's NOT in this package

- Rail adapters (Ergo / Rosen / Base / x402) → `@accord-protocol/rails-*`
- HTTP transport (Accord/402) → `@accord-protocol/gateway`
- MCP transport (Accord/MCP) → `@accord-protocol/mcp`
- Conformance suite → `@accord-protocol/conformance`
- Signing / verification primitives — bring your own libsodium / secp256k1 / ergo-sigma binding; this package only computes the signing-input hash.

## License

MIT.
