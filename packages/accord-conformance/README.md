# `@accord-protocol/conformance`

Accord Protocol conformance suite. Library + CLI that exercises **all five levels** (L0 schema, L1 transport, L2 rail, L3 security, L4 registry) against an Accord implementation. **The output is the source of truth for "Accord-compatible (L*)" badge claims** per [TRADEMARK.md](../../TRADEMARK.md).

## Install

```bash
npm install --save-dev @accord-protocol/conformance @accord-protocol/core
# or run on the fly:
npx accord-conformance run
```

## CLI subcommands

```bash
accord-conformance run     [flags]              # default if no subcommand (back-compat)
accord-conformance keygen                       # generate ed25519 keypair
accord-conformance sign    --key 0x... <input.json>     # sign any Accord JSON object
accord-conformance verify  [--expected-key 0x...] <signed.json>
```

`run` is invoked by default if no subcommand is given, so prior usage like `npx accord-conformance --levels L0,L1` still works.

## Levels

```text
L0  Schema-compatible       — objects validate against schemas/v0
L1  Transport-compatible    — Accord/402 or Accord/MCP roundtrip works
L2  Rail-compatible         — at least one rail adapter passes verifyPayment + settle
L3  Security-compatible     — production-safety gates fire on mainnet writes
L4  Registry-certified      — listed in the public registry with passing conformance
```

This package ships **all five levels** (L0 + L1 + L2 + L3 + L4). The CLI runs them in-process by default, or against a live HTTP endpoint via `--target <url>`.

```text
$ npx accord-conformance --levels L0,L1,L2,L3,L4

  L0 PASS  (20/20 pass, 0 fail, 0 inconclusive)
  L1 PASS  (13/13 pass, 0 fail, 0 inconclusive)
  L2 PASS  (24/24 pass, 0 fail, 0 inconclusive)
  L3 PASS  (12/12 pass, 0 fail, 0 inconclusive)
  L4 PASS  (13/13 pass, 0 fail, 0 inconclusive)

Achieved: L4
```

## L3 — what it checks (security gates)

Probes `assertProductionSafety()` and the audit-manifest verifiers in both rail SDKs:

- Mainnet writes without `scriptErgoTree` → `INSECURE_MAINNET_MODE`
- Mainnet writes with arbitrary tree but no `auditPolicy` → `UNAUDITED_ERGOTREE`
- The documented `dangerouslyAllowInsecureMainnetP2PK` / `dangerouslyAllowUnauditedContract` escape hatches still work
- Testnet always allowed
- `verifyAuditedErgoTree({ requireMainnet: true })` rejects on a draft-pre-audit manifest
- Both audit manifests are in `draft-pre-audit` status with all entries `mainnetAllowed: false`
- Same probes run for the Base/EVM rail's `assertProductionSafety` + `verifyAuditedContract`

## L4 — what it checks (registry validation)

Static-validates the `registry/` folder:

- `registry/{providers,verifiers,rails,manifests}/*.json` parse + carry the right `type` literal + `version: "v0"`
- `registry/revocations.json` is a well-formed array
- Each rail record's `manifest` field points at a manifest file that exists
- Provider records' `accepted_rails[]` only name rails registered in `registry/rails/`
- `conformance.level` (when claimed) is one of L0–L4

## Network mode (HTTP probing)

`--target <url>` makes the L1 transport probe a real HTTP endpoint instead of running in-process. Three probes:

```text
$ npx accord-conformance --levels L1 --target https://provider.example/api/run

  1. POST without Accord-* headers → expects 402 + Accord-Version, Accord-Agreement-Required, WWW-Authenticate: Accord402
  2. POST with X-Accord-Agreement-Id but no payment → expects 402 + body.error in {MISSING_PAYMENT, UNKNOWN_AGREEMENT}
  3. POST with both headers (only when --agreement-id + --payment supplied) → expects 200 + x-accord-agreement-hash + body { output, _meta }
```

Optional flags for the happy-path probe:

```bash
npx accord-conformance --levels L1 \
  --target https://provider.example/api/run \
  --agreement-id acc_01HX… \
  --payment '{"value":"0.001"}'
```

### MCP-stdio mode

`--target stdio:./build/mcp-server.js` spawns a child process and probes its JSON-RPC over stdin/stdout per the MCP spec:

```bash
npx accord-conformance run --levels L1 \
  --target stdio:./build/mcp-server.js
```

Four checks:
1. `initialize` → server returns `protocolVersion`
2. `tools/list` → returns at least one tool whose `inputSchema` declares `accord_agreement_id` + `accord_payment`
3. `tools/call` without `accord_agreement_id` → `_meta.accord_error_code == MISSING_AGREEMENT_ID`
4. `tools/call` with agreement-id but no payment → `_meta.accord_error_code ∈ {MISSING_PAYMENT, UNKNOWN_AGREEMENT}`

## Conformance-result signing

Sign a conformance result so the registry / verifiers can confirm provenance:

```bash
# 1. Generate keypair (one-time setup)
$ npx accord-conformance keygen

# 2. Run + sign + submit
$ npx accord-conformance run --levels L0,L1,L2,L3,L4 --json > result.json
$ npx accord-conformance sign \
    --key 0x<your private key> \
    --signer 'verifier://your-id' \
    -o signed.json \
    result.json

# 3. Anyone can verify
$ npx accord-conformance verify signed.json
$ npx accord-conformance verify --expected-key 0x<your public key> signed.json
```

The signing input is `BLAKE2b-256(canonical_json_bytes(object_without_signature))` — same algorithm as ACCORD-002 §5 receipts. Tampering with any field after signing breaks the signature; `verify` exits non-zero with code `BAD_SIGNATURE`.

The same `sign`/`verify` subcommands work on **any** Accord JSON object — Agreement, Verification Receipt, audit manifest, registry record. The signature shape (`scheme: "ed25519"`, hex-encoded `public_key` + `signature` + ISO-8601 `signed_at`) is uniform across artifacts.

## L1 — what it checks

L1 exercises the **Accord/MCP** and **Accord/402** transports against the reference `@accord-protocol/{mcp,gateway}` implementations with a Mock rail + a synthetic verifier:

- **MCP** — `wrapAccordMcp` rejects calls without `accord_agreement_id`; happy path runs the handler; `_meta.accord_agreement_hash` is the canonical-bytes blake2b256; embedded Verification + Settlement Receipts pass core's validators.
- **Accord/402** — no Accord-* request headers → 402 with the right response headers (`Accord-Version`, `Accord-Agreement-Required`, `WWW-Authenticate: Accord402`); valid request → 200 with `{ output, _meta }` body and `x-accord-agreement-hash` response header; embedded receipts validate; second use of the same `payment_id` is rejected with `REPLAY_DETECTED`.

## L2 — what it checks

L2 exercises each of the four reference rails (`rails-ergo`, `rails-rosen`, `rails-base`, `rails-x402`) with a stub backend, six checks per rail:

- `verifyPayment(happy)` returns `ok=true`
- `payment_id` is a non-empty string (suitable for replay protection)
- `rail.settle()` is implemented and returns a Settlement Receipt
- The Settlement Receipt passes core's `validateSettlementReceipt`
- `receipt.mode` is in `RAIL_MODE_ALLOWLIST[rail]`
- `verifyPayment(garbage)` does not return `ok=true`

A third-party rail can be tested with the same harness by passing it via `runL2({ extraRails: [...] })`.

```text
$ npx accord-conformance --levels L0,L1,L2

  L0 PASS  (20/20 pass, 0 fail, 0 inconclusive)
  L1 PASS  (13/13 pass, 0 fail, 0 inconclusive)
  L2 PASS  (24/24 pass, 0 fail, 0 inconclusive)

Achieved: L2
```

```text
$ npx accord-conformance --levels L0,L1

  L0 PASS  (20/20 pass, 0 fail, 0 inconclusive)
  L1 PASS  (13/13 pass, 0 fail, 0 inconclusive)

Achieved: L1
```

## CLI

```bash
# Run L0 against the current repo
npx accord-conformance

# Explicit
npx accord-conformance --levels L0

# Request more levels (some may report inconclusive until they ship)
npx accord-conformance --levels L0,L1,L2

# JSON output — what you submit to the registry
npx accord-conformance --json > conformance-result.json

# Run against a specific repo dir
npx accord-conformance --repo-root /path/to/your/accord-protocol-fork
```

Exit codes:

- **0** — every requested level passed
- **1** — at least one fail or inconclusive at the requested levels
- **2** — CLI usage error

## Library

```ts
import { runConformance } from "@accord-protocol/conformance";

const result = await runConformance({
  repoRoot: process.cwd(),
  levels: ["L0"],
});
console.log(result.achieved_level); // "L0" | "L1" | … | null
```

The `ConformanceResult` is JSON-shaped — same as the CLI's `--json` output. Submit it to `registry.accordprotocol.ai` to claim a badge.

## L0 — what it checks

For every fixture in `test-vectors/{agreement,verification-receipt,settlement-receipt}/v0/`:

1. **JSON Schema validation** against the matching `schemas/<kind>.v0.schema.json`.
   - Filenames that start with `invalid-` are expected to fail validation. The check passes iff ajv rejects.
2. **Canonical-bytes equality** against the pinned `<name>.canonical.txt` sidecar (for accept-case fixtures).
3. **`accord_hash_v0` equality** against the pinned `<name>.hash.txt` sidecar (for accept-case fixtures).

Missing pinned sidecars are reported as `inconclusive` (not `fail`) — the implementation isn't broken, the fixtures just need re-deriving via `node scripts/derive-fixture-hashes.mjs`.

## What's NOT in this PR

- L1 / L2 transport / rail tests — PR-018 / PR-019.
- A network-mode CLI (`--target https://provider.example`) — for L0 the implementation under test is a directory of schemas + fixtures, not a live endpoint. L1 / L2 will introduce HTTP / MCP probing.
- Conformance-result signing. The result JSON is plain text today; v1 may add an issuer signature so the registry can verify provenance.

## License

MIT.
