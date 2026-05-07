# `@accord-protocol/conformance`

Accord Protocol conformance suite. Library + CLI that exercises every level (L0 schema, L1 transport, L2 rail) against an Accord implementation. **The output is the source of truth for "Accord-compatible (L*)" badge claims** per [TRADEMARK.md](../../TRADEMARK.md).

## Install

```bash
npm install --save-dev @accord-protocol/conformance @accord-protocol/core
# or run on the fly:
npx accord-conformance
```

## Levels

```text
L0  Schema-compatible       — objects validate against schemas/v0
L1  Transport-compatible    — Accord/402 or Accord/MCP roundtrip works
L2  Rail-compatible         — at least one rail adapter passes verifyPayment + settle
L3  Security-compatible     — production-safety gates fire on mainnet writes
L4  Registry-certified      — listed in the public registry with passing conformance
```

This package ships **L0 today** (PR-017). L1 / L2 land in PR-018 / PR-019. L3 lives in the per-rail packages' tests; L4 is a registry-side claim.

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
