# Canonical JSON encoding (`accord-canonical-json/v0`)

Accord protocol objects (Agreement, Verification Receipt, Settlement Receipt)
are hashed and signed over a deterministic JSON serialization. This page is
the normative reference for that serialization. The hash is:

```text
accord_hash_v0 = BLAKE2b-256( canonical_json_bytes(object) )
```

## 1. Rules

A canonical JSON serializer for Accord MUST produce the same byte-for-byte
output for any two objects whose semantics are identical. The rules below
are sufficient.

### 1.1 Encoding

- **UTF-8**, no BOM.
- No insignificant whitespace anywhere. Specifically: no space after `:`, no
  space after `,`, no leading or trailing whitespace, no newlines between
  elements.

### 1.2 Object keys

- Sorted **lexicographically by Unicode codepoint** (i.e. byte-order on the
  UTF-8 representation, since codepoint order ≡ UTF-8 byte order for valid
  Unicode).
- Sort recursively at every nesting level.
- Duplicate keys MUST be rejected at parse time.

### 1.3 Numbers

- **Integers** as a sequence of decimal digits with no leading zero
  (`123`, not `0123`). Negative integers prefixed `-` (`-1`). The integer `0`
  is encoded as `0`. No `+` sign.
- **No floats anywhere in v0 protocol objects.** The schemas reject them.
  Money amounts are JSON strings (see §1.5).
- No exponent form (`1e3`, `1.5E-2` etc).

### 1.4 Strings

- Minimal escaping: `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t` for the
  characters that require escaping. Other control chars (U+0000..U+001F)
  use the `\u00XX` form. Everything else is emitted as the raw UTF-8 bytes
  (no `\uXXXX` for printable Unicode).
- No `\u` for characters above U+007F that are also valid UTF-8.

### 1.5 Money / amounts

Always JSON strings with the regex `^(0|[1-9][0-9]*)(\.[0-9]+)?$`. No
exponents. No leading `+`. The schema enforces this; canonical encoding
just preserves it.

### 1.6 Timestamps

ISO-8601 UTC with `Z` suffix and second precision: `YYYY-MM-DDTHH:MM:SSZ`.
Sub-second precision is forbidden in v0; if your event log has it, truncate
before constructing the protocol object.

### 1.7 Arrays

Preserve insertion order. Arrays are NOT sorted — ordering is
caller-meaningful (e.g. the `checks` array of a Verification Receipt
records evaluation order).

### 1.8 Reserved namespace

Top-level extension fields whose key starts with `accord_` are reserved
for future spec additions. v0 implementations MUST reject objects that
include such fields unless an explicit `--accept-unknown` flag is set.

## 2. Reference algorithm

```ts
function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("ACCORD_INVALID_AMOUNT: floats are not allowed");
    }
    return value.toString(10);
  }
  if (typeof value === "string") return JSON.stringify(value); // minimal escapes
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalize((value as any)[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error("ACCORD_INVALID_SCHEMA: unsupported value");
}
```

`JSON.stringify` produces the right minimal-escape behaviour for strings
in browsers and Node, modulo the surrogate-pair edge cases that the
WHATWG spec already pins down. Non-JS implementations MUST replicate the
same set of escapes.

## 3. Worked example

Input (semantically identical inputs MUST canonicalize to the same bytes):

```json
{
  "type": "accord.agreement.v0",
  "version": "v0",
  "agreement_id": "acc_01HX0000000000000000000000",
  "created_at": "2026-05-07T00:00:00Z",
  "buyer":  { "id": "agent://buyer" },
  "seller": { "id": "provider://repo-audit-agent" },
  "task":   { "kind": "repo_audit", "input_ref": "github:https://github.com/org/repo", "description": "Audit." },
  "price":  { "amount": "25", "currency": "ERG", "decimals": 9 },
  "payment": { "mode": "note", "rail": "ergo", "reserve_ref": "ergo:box:abc", "deadline": "+480 blocks" },
  "verification": { "required": true, "method": "verifier_receipt", "verifier": "verifier://security-v0" },
  "settlement":   { "mode": "batchable", "refund_policy": "expiry", "dispute_policy": "verifier_panel" }
}
```

Canonical bytes (newline-wrapped here for readability — the actual bytes
have no newlines):

```text
{"agreement_id":"acc_01HX0000000000000000000000","buyer":{"id":"agent://buyer"},"created_at":"2026-05-07T00:00:00Z","payment":{"deadline":"+480 blocks","mode":"note","rail":"ergo","reserve_ref":"ergo:box:abc"},"price":{"amount":"25","currency":"ERG","decimals":9},"seller":{"id":"provider://repo-audit-agent"},"settlement":{"dispute_policy":"verifier_panel","mode":"batchable","refund_policy":"expiry"},"task":{"description":"Audit.","input_ref":"github:https://github.com/org/repo","kind":"repo_audit"},"type":"accord.agreement.v0","verification":{"method":"verifier_receipt","required":true,"verifier":"verifier://security-v0"},"version":"v0"}
```

The fixed test vector for this example, with the resulting `accord_hash_v0`,
will land alongside `@accord-protocol/core` in PR-008.

## 4. Signing receipts (ACCORD-002 §5)

When a verifier signs a receipt the input to the signing function is:

```text
signing_input = BLAKE2b-256( canonical_json_bytes( receipt_without_signature_field ) )
```

Strip `signature` from the receipt object, run the canonicalizer, BLAKE2b-256
the output, sign that 32-byte hash with the verifier's private key.

Verification reverses the steps and checks the signature against the
verifier's registered public key (ACCORD-008 registry).

## 5. Test vectors

Cross-language fixtures live in `test-vectors/canonicalization/`:

```text
test-vectors/canonicalization/
├── 01-keys-sorted.json              — keys-out-of-order input + canonical output
├── 02-nested-objects.json           — recursive canonicalization
├── 03-array-order-preserved.json    — arrays unchanged
├── 04-string-escapes.json           — control chars, quotes, backslashes, unicode
├── 05-money-as-string.json          — amounts as strings, never numbers
├── 06-timestamp-utc.json            — ISO-8601 second precision
├── 07-reject-float-amount.json      — must throw ACCORD_INVALID_AMOUNT
├── 08-reject-duplicate-keys.json    — must throw ACCORD_INVALID_SCHEMA
└── 09-reject-reserved-prefix.json   — must throw ACCORD_UNKNOWN_CRITICAL_EXTENSION
```

Each fixture has:

- `input.json` — the human-friendly source
- `canonical.txt` — the expected canonical bytes (or `error: <code>` for
  rejection cases)
- `hash.txt` — the expected `accord_hash_v0` hex (only for accept cases)

These are loaded by the conformance suite (ACCORD-009).
