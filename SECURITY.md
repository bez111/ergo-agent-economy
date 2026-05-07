# Security Policy

## Status

**`ergo-agent-economy` is alpha software.** v0 of the protocol (see
[SPEC.md](SPEC.md)) is intended for **testnet development**.

**`NOT CERTIFIED FOR MAINNET`.** The compiled ergoTrees in
`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json` are in
`status: "draft-pre-audit"` and every entry is `mainnetAllowed: false`.
Mainnet writes are blocked by the SDK until an external auditor signs the
manifest and flips the flag. See
[`packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json`](packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json)
and [the auditor request](docs/audit/AUDITOR_REQUEST.md).

Do not put more value at risk than you can afford to lose.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive bugs.

Instead, email the maintainer directly. Include:

* a description of the vulnerability and the affected component
  (`ergo-agent-pay`, `ergo-agent-py`, `ergo-agent-mcp`, on-chain script,
  or spec text);
* steps or a minimal reproduction;
* the impact you believe is achievable;
* whether you are willing to be credited.

We aim to acknowledge reports within seven days and to publish a fix or a
mitigation note before disclosing the issue publicly.

## Threat model — v0

This is the threat model the v0 implementation is designed to handle. Risks
flagged as *out of scope* are real but not yet addressed; they are tracked
on the roadmap.

### In scope

| Threat | Mitigation |
|---|---|
| Off-chain hash (SHA-256 etc.) silently disagreeing with on-chain `blake2b256` | Single normative hash function (BLAKE2b-256), enforced by golden vectors shared between SDKs |
| Dev-mode P2PK boxes broadcast on mainnet, leaving the predicate unenforced | `assertProductionSafety()` in the SDK; requires explicit `dangerouslyAllowInsecureMainnetP2PK: true` opt-in on mainnet, error code `INSECURE_MAINNET_MODE`. The legacy alias `allowInsecureDevMode` is deprecated. |
| Arbitrary unaudited ergoTree slipping past the guardrail | `assertProductionSafety()` requires `auditPolicy` on mainnet; error code `UNAUDITED_ERGOTREE`. The high-level SDK rejects any tree whose hash is not in the audited manifest unless `dangerouslyAllowUnauditedErgoTree: true`. |
| Empty-string `scriptErgoTree` slipping past the guardrail | Treated as missing, also rejected on mainnet |
| Malformed task hash (wrong length, non-hex characters) issued into R6 | `validateTaskHash` rejects anything that is not exactly 64 lowercase/uppercase hex chars |
| Task output too large for the v0 single-byte length prefix | `encodeSigmaCollByte` enforces `taskOutput.length <= 255`; raises `INVALID_ENCODING`. Hand-rolled length encoding has been removed from `dangerouslyBuildRedeemNoteTx` and `dangerouslyBuildBatchSettleTx`. |
| Cross-language SDK drift (TS ≠ Python ≠ MCP) | Single shared `test-vectors/task-hash.json`, loaded by both test suites |
| Replay or double-spend within a single SDK session | Per-Reserve Tracker box (see SPEC §4); sessionSpend bound is enforced by the policy engine |
| Mempool front-running of `task_hash_v0`-bound Notes | `task_hash_v0` is `mainnetAllowed: false` in the audit manifest. Mainnet integrations must use `credential_v0` (or a future `bound_receiver_v0`) which require `proveDlog(receiver)` so a copied taskOutput cannot redeem to a different address. |
| Raw lifecycle builders accidentally bypassing the audit gate | Renamed to `dangerouslyBuildCreateReserveTx` etc. The unprefixed names remain as deprecated aliases for one minor-version cycle. The high-level `ErgoAgentPay` class is the only path that always applies the audit gate. |
| Schnorr `(a, z)` byte split being malleable (I-003) | The Basis sources split a 64-byte signature positionally with `slice(0, 33)` / `slice(33, size)`. This is safe under Fiat-Shamir: `decodePoint` rejects a malformed compressed `aBytes`; `byteArrayToBigInt(empty)` would zero `z`, but the challenge `e = blake2b256(aBytes ‖ message ‖ pubkey)` is committed-to in `aBytes`, so an attacker who picks `a` cannot also pick a matching `e`. Documented for the auditor so the analysis does not need to be redone. |

### Out of scope (tracked, not yet mitigated)

* **Auditing of the on-chain ChainCash / Basis scripts.** Until those are
  audited and integrated, mainnet use requires `allowInsecureDevMode` plus
  manual review of whatever ergoTree the caller supplies.
* **Tracker double-spend resistance under concurrent redemption.** v0 keeps
  the spent set as a flat list; v1 will move to a Merkle-root commitment
  with formal collision arguments.
* **Long task outputs.** v0 fits task outputs into a single-byte length
  prefix; longer outputs require a varint and are explicitly v1.
* **Federated trackers and cross-chain liquidity.**
* **Privacy of counterparties and amounts.**
* **Wallet supply-chain attacks** on the agent's signer. The SDK accepts
  any function that satisfies `SignerFn`; protecting the signer (HSM,
  detached signing, approval gating) is the integrator's responsibility.
* **The MCP attack surface.** The MCP server inherits the trust boundary
  of the host process — anything that can reach it can call its tools.
  Use `policy` (budget caps, approval prompts) to bound damage.

## Operational guidance

* Run on Ergo testnet until you have a compiled, reviewed `scriptErgoTree`.
* When you do go to mainnet, prefer a hardware-signed flow over a
  software signer; treat `allowInsecureDevMode: true` as a smell.
* Fund a fresh address per agent so a compromised agent's blast radius is
  one Reserve, not your wallet.
* Configure `policy.maxSinglePayment`, `policy.maxSessionSpend`, and
  `policy.requireApprovalAbove` even when the address is funded with small
  amounts — they limit what a misbehaving agent can do per session.
* Log every `unsignedTx` before signing. The on-chain effect of an Ergo
  transaction is fully described by its EIP-12 form.

## Known limitations

* The high-level `ErgoAgentPay` SDK enforces production safety. The raw
  builders in `lifecycle.ts` do not — they are advanced primitives. If you
  call them directly, call `assertProductionSafety()` yourself.
* The Python SDK delegates transaction signing to either the TypeScript SDK
  or an external tool; it is read-side only for now. Apply the same
  guardrails wherever the actual signing happens.
* The MCP server exposes the full lifecycle tool surface
  (`ergo_create_reserve`, `ergo_issue_note`, `ergo_redeem_note`,
  `ergo_settle_batch`, `ergo_deploy_tracker`). These tools route through
  the same `assertProductionSafety` gate as the SDK; mainnet writes still
  require an audited `scriptErgoTree` plus an `auditPolicy` verdict.
  Treat MCP host trust as an additional attack surface — anything that
  can call the MCP server can attempt to issue Notes against the agent's
  reserve, bounded only by the policy engine.
