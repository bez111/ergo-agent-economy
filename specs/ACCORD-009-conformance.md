# ACCORD-009 — Conformance

| Status | Draft |
|---|---|
| Version | v0 |
| Last updated | 2026-05-07 |
| Editors | bez111 |
| Implements in this repo | [`@accord-protocol/conformance`](../packages/accord-conformance/) |

## 1. Purpose

Conformance is what gives an Accord-compatibility claim teeth. A third-party SDK / endpoint / rail adapter that says *"Accord/MCP certified (L1)"* MUST have produced a conformance-suite result that backs the claim. The output JSON is the source of truth for the claim and the `accord-compatible` badge per [TRADEMARK.md](../TRADEMARK.md).

This spec defines:

- The **five conformance levels** (L0–L4) and what each level checks.
- The **JSON shape** of a conformance result.
- The **signing convention** for results submitted to the registry.
- The **achieved-level** computation (monotonic walk).

## 2. Levels

```text
L0  Schema-compatible       — objects validate against schemas/v0
L1  Transport-compatible    — Accord/402 or Accord/MCP roundtrip works
L2  Rail-compatible         — at least one rail adapter passes verifyPayment + settle
L3  Security-compatible     — production-safety gates fire on mainnet writes
L4  Registry-certified      — registry/ records validate + cross-resolve
```

Level claims are **monotonic**: a claim of "Accord-compatible (L2)" implies L0 and L1 also pass for the same implementation. The runner refuses to claim a higher level when a lower one fails.

### 2.1 L0 — Schema-compatible

For every fixture in `test-vectors/{agreement,verification-receipt,settlement-receipt}/v0/`:

- JSON Schema validation against `schemas/<kind>.v0.schema.json`. Filenames starting with `invalid-` are expected to fail validation.
- Canonical-bytes equality against pinned `<name>.canonical.txt` (accept-case fixtures only).
- `accord_hash_v0` equality against pinned `<name>.hash.txt`.

20 checks against this repo's reference fixture set.

### 2.2 L1 — Transport-compatible

Two transports, run independently. The implementation under test (IUT) is whatever the operator hands the suite — the in-process reference implementations by default, or a live endpoint via `--target`.

**Accord/402 (HTTP)** — see [ACCORD-004](./ACCORD-004-accord-402.md):

- POST without Accord-* headers → 402 with `Accord-Version`, `Accord-Agreement-Required`, `WWW-Authenticate: Accord402` and `body.error == ACCORD_PAYMENT_REQUIRED`.
- POST with agreement-id but no payment → 402 with `body.error ∈ {MISSING_PAYMENT, UNKNOWN_AGREEMENT}`.
- POST with both → 200 with `x-accord-agreement-hash` header and body `{ output, _meta }`.
- Replay protection: second use of the same `payment_id` is rejected with `REPLAY_DETECTED`.

**Accord/MCP (stdio JSON-RPC)** — see [ACCORD-005](./ACCORD-005-accord-mcp.md):

- `initialize` → server returns `protocolVersion`.
- `tools/list` → at least one tool's `inputSchema` declares `accord_agreement_id` + `accord_payment`.
- `tools/call` without `accord_agreement_id` → `_meta.accord_error_code == MISSING_AGREEMENT_ID`.
- `tools/call` with agreement-id but no payment → `_meta.accord_error_code ∈ {MISSING_PAYMENT, UNKNOWN_AGREEMENT}`.

13 checks (in-process) against the reference `@accord-protocol/{mcp,gateway}`. 4 checks (MCP-stdio probe) against any spawned MCP server.

### 2.3 L2 — Rail-compatible

For each rail under test, six checks:

1. `verifyPayment(happy)` returns `ok=true`
2. `payment_id` is a non-empty string
3. `rail.settle()` is implemented and returns a Settlement Receipt
4. The receipt passes `validateSettlementReceipt`
5. `receipt.mode` is in `RAIL_MODE_ALLOWLIST[receipt.rail]`
6. `verifyPayment(garbage)` does not return `ok=true`

Run against the four reference rails (`ergo`, `rosen`, `base`, `x402`) by default = 24 checks. Third-party rails are tested via `runL2({ extraRails: [...] })`.

### 2.4 L3 — Security-compatible

Probes the production-safety gates of both rail SDKs:

- Mainnet writes without `scriptErgoTree` → `INSECURE_MAINNET_MODE`.
- Mainnet writes with arbitrary tree but no `auditPolicy` → `UNAUDITED_ERGOTREE`.
- Documented escape hatches (`dangerouslyAllowInsecureMainnetP2PK`, `dangerouslyAllowUnauditedContract`) still work.
- Testnet always allowed.
- `verifyAuditedErgoTree({ requireMainnet: true })` rejects on a draft-pre-audit manifest.
- Both audit manifests are in `draft-pre-audit` with all entries `mainnetAllowed: false` (or `entries: []`).

12 checks. A third-party SDK that re-implements `assertProductionSafety` should pass the same probes.

### 2.5 L4 — Registry-certified

Static-validates the `registry/` folder:

- Each record's `type` and `version` match the expected literals.
- `registry/revocations.json` is a well-formed array.
- Rail records' `manifest_path` resolves to a file.
- Provider records' `accepted_rails ⊆ registered rails`.
- `conformance.level` (when claimed) ∈ {L0–L4}.

13 checks against this repo's `registry/`.

## 3. ConformanceResult JSON shape

```json
{
  "target": "local:accord-protocol",
  "started_at": "2026-05-07T00:00:00Z",
  "finished_at": "2026-05-07T00:00:01Z",
  "levels": [
    {
      "level": "L0",
      "passed": true,
      "passed_count": 20,
      "failed_count": 0,
      "inconclusive_count": 0,
      "checks": [
        {
          "id": "L0.schema.agreement.minimal",
          "level": "L0",
          "description": "Validate test-vectors/agreement/v0/minimal.json",
          "result": "pass",
          "duration_ms": 0.5
        }
      ]
    }
  ],
  "achieved_level": "L4"
}
```

Per-check fields:

- `id` — stable identifier, e.g. `L0.schema.agreement.minimal`. Stable across runs so a registry can diff results.
- `level` — `L0` | `L1` | `L2` | `L3` | `L4`.
- `description` — human-readable.
- `result` — `pass` | `fail` | `inconclusive`. Inconclusive means "could not run" (e.g. dependency unmet, fixture missing) and is treated as not-passing for the level summary.
- `detail` — present when `result != pass`.

## 4. Achieved level

The runner walks `[L0, L1, L2, L3, L4]` in order. The achieved level is the highest level that passed AND all lower levels passed. If any level fails, `achieved_level` stops at the previous one. If even L0 fails, `achieved_level` is `null`.

## 5. Signed conformance results

A conformance result MAY be signed. The signature shape mirrors ACCORD-002 §5 receipts:

```json
{
  "target": "...",
  "started_at": "...",
  "...": "...",
  "achieved_level": "L4",
  "signature": {
    "scheme": "ed25519",
    "public_key": "0x<64 hex>",
    "signature": "0x<128 hex>",
    "signer": "verifier://your-id",
    "signed_at": "2026-05-07T00:00:00Z"
  }
}
```

Signing input: `BLAKE2b-256(canonical_json_bytes(result_without_signature))`.

The CLI subcommands `accord-conformance sign` and `accord-conformance verify` produce / validate this shape. The same subcommands work on any Accord JSON object — Agreement, Receipt, audit manifest — uniformly.

A registry-submitted conformance result SHOULD be signed by the provider's identity key. Verifiers and aggregators can then:

```bash
$ accord-conformance verify --expected-key 0x... result.json
✓ valid ed25519 signature
```

## 6. CLI

```bash
accord-conformance run [--repo-root <dir>] [--levels L0,L1,L2,L3,L4] [--json]
accord-conformance run --levels L1 --target https://provider/api/run
accord-conformance run --levels L1 --target stdio:./build/server.js
accord-conformance keygen
accord-conformance sign --key 0x... [--signer <id>] [-o <path>] <input.json>
accord-conformance verify [--expected-key 0x...] <signed.json>
```

Exit codes: 0 (all requested levels pass), 1 (any fail/inconclusive), 2 (usage error).

## 7. Reference implementation

[`@accord-protocol/conformance`](../packages/accord-conformance/). 42 unit tests covering every level + signing infrastructure. The CLI ships as the package's `bin` entry; runs via `npx accord-conformance` after `npm install`.

## 8. Open questions (v1 candidates)

- **L4 cross-rail validation.** Today L4 only checks the registry's record shape. v1 may add cross-checks against the conformance-result history (e.g. "this provider's last 5 L2 runs all passed").
- **Conformance result registry CI.** A scheduled job that re-fetches signed conformance results and re-verifies them, marking stale results as `inconclusive`.
- **Negative-test fixtures for L3.** v0 L3 only probes happy / rejection paths. v1 could add fuzz-style invariant tests.
