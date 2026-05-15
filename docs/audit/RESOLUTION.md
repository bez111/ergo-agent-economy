# Resolution table — fixes applied to DEEP_REVIEW findings

Companion to [`DEEP_REVIEW.md`](DEEP_REVIEW.md). Tracks the actual fixes
landed against each finding. **Not** an audit certificate — an external
auditor still has to sign
[`AUDITED_ERGOTREES.json`](../../packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json)
before mainnet.

| ID | Severity | Status | Fix landed |
|---|---|---|---|
| C-001 | Critical | ⛔ residual | `task_hash_v0` permanently `mainnetAllowed: false`. `credential_v0` (which already uses `proveDlog(R7)`) is the documented mainnet path. No new predicate added — `credential_v0` already covers receiver binding. |
| C-002 | Critical | ✅ fixed | `selfPreserved` in `reserve.es` now includes `selfOut.R5[AvlTree].get == SELF.R5[AvlTree].get`. Top-up and mint-note inherit the check. |
| C-003 | Critical | ✅ fixed | `basis.es` and `basis-token.es` branch on `lookupProofOpt.isDefined`: `update` for repeat redemption, `insert` for first redemption. `@fleet-sdk/compiler` does not yet expose `insertOrUpdate`; this branching is the cycle-free equivalent. |
| H-001 | High | ⛔ residual | Hardcoded mainnet oracle / buyback NFT IDs remain in `reserve.es`. Templating requires a manifest-level per-network split; tracked for v1 of the scripts package. |
| H-002 | High | ✅ partial | Mint-note action now requires the output at `getVar[Int](7)` to have Note-shaped registers (`R4` AVL tree, `R5 == ownerKey`, `R6 == 0L`) and at least one token. **Cannot** bind to the Note's contract hash directly without a compile cycle (note already binds to reserve via `$reserveContractHash`). |
| H-003 | High | ⛔ documented | Confirmed upstream design: every Note holder must reference a Reserve box where `R4 == holder`. Documented in [`SPEC.md`](../../SPEC.md) so users understand the bilateral-IOU semantics; not changed because changing it would break ChainCash compatibility. |
| H-004 | High | ✅ fixed | Action 0 now gated on `redeemed > 0`. Buyback fee branch removed in favour of unconditional check. Zero-value redemption is no longer reachable. |
| M-001 | Medium | ✅ fixed | `reserve.es` reads the redeemer's pubkey from `getVar[GroupElement](6)`, sets `receiptOut.R7 == redeemerKey`, and adds `proveDlog(redeemerKey)` to the action 0 sigma proposition. Receipt re-redemption keeps the right with the actual redeemer. Comment in `receipt.es` re-aligned. |
| M-002 | Medium | ⛔ residual | Receipt R6 burn-timer reset on re-redemption is upstream behaviour and does not constitute a money loss. Documented in `DEEP_REVIEW.md`; auditor decides. |
| M-003 | Medium | ⛔ residual | Tracker DoS via `creationInfo._1` requires a different tracker box format (explicit `lastSignedAt` register). v1 design item; not changed in this hardening pass because it changes the tracker contract surface, not just the reserve. |
| M-004 | Medium | ✅ fixed | `assertProductionSafety` wraps `auditPolicy` in try/catch and converts thrown errors into `UNAUDITED_ERGOTREE`. Original error preserved as `cause`. Four new tests cover sync throw, async reject, non-Error throw, cause preservation. |
| M-005 | Medium | ✅ fixed | `loadAuditedManifest` now invokes `assertManifestMatchesRegistry` on first load. Refuses to load when `registry.entry.ergoTreeHex != manifest.entry.ergoTreeHex`. Exposed as `verifyManifestAgainstRegistry()` for explicit CI use. |
| M-006 | Medium | ✅ fixed | `dangerouslyAllowUnauditedErgoTree` mirrored to `NoteOptions` / `ReserveConfig` / `TrackerConfig`. SDK uses OR over config and per-call value. New test asserts both directions. |
| M-007 | Medium | ⛔ residual | Empty `trackerSigBytes` triggering emergency mode is a contract-level encoding choice. SDK side will refuse to emit empty bytes when a basis-redemption builder lands; out of scope for this hardening pass. |
| L-001 | Low | ✅ fixed | `encodeSigmaCollByte` rejects length=0 with `INVALID_ENCODING` and a message pointing at the no-op-predicate risk. Existing test updated. |
| L-002 | Low | ⛔ deferred | `INPUTS(-action)` bounds in `note.es` fail closed already; explicit cap not added to keep upstream-faithful. |
| L-003 | Low | ✅ fixed | `decodeRegisterInt` switched to `BigInt` parse with safe-integer range check. Throws `INVALID_ENCODING` on out-of-range values. |
| L-004 | Low | ⛔ informational | `noTokensInOutputs` rejecting fee outputs is intended ChainCash behaviour and harmless on mainnet. |
| I-001..I-003 | Info | n/a | Observations; no action required. |

## Summary

* **Fixed (10):** C-002, C-003, H-002 (partial), H-004, M-001, M-004, M-005, M-006, L-001, L-003.
* **Residual (8):** C-001 (mitigation in place), H-001, H-003, M-002, M-003, M-007, L-002, L-004.

## What changed in vendored sources

| File | Modification |
|---|---|
| `data/sources/reserve.es` | C-002 (R5 in selfPreserved), H-002 (mint-note shape check), H-004 (mandatory buyback), M-001 (R7 = redeemer), `proveDlog(redeemerKey)` on action 0, `proveDlog(ownerKey)` on action 2 |
| `data/sources/basis.es` | C-003 (insert vs update branching) |
| `data/sources/basis-token.es` | C-003 (insert vs update branching) |
| `data/sources/receipt.es` | M-001 (comment alignment with reserve.es) |
| `data/sources/note.es` | unchanged (L-002 deferred) |

## What changed in the SDK

| File | Modification |
|---|---|
| `packages/ergo-agent-pay/src/safety.ts` | M-004: try/catch on `auditPolicy`, wraps thrown values in `UNAUDITED_ERGOTREE` with `cause` preserved |
| `packages/ergo-agent-pay/src/types.ts` | M-006: per-call `dangerouslyAllowUnauditedErgoTree` on `NoteOptions / ReserveConfig / TrackerConfig` |
| `packages/ergo-agent-pay/src/ErgoAgentPay.ts` | M-006: OR-merge of config and per-call flag |
| `packages/ergo-agent-pay/src/encoding.ts` | L-001: reject length=0 with `INVALID_ENCODING` |
| `packages/ergo-agent-pay/src/lifecycle.ts` | L-003: `decodeRegisterInt` uses `BigInt` and rejects out-of-range values |
| `packages/ergo-agent-scripts/src/audited.ts` | M-005: registry / manifest cross-check on first manifest load |
| `packages/ergo-agent-scripts/src/index.ts` | M-005: re-export `verifyManifestAgainstRegistry` |

## Tree-hash diff

Recompiled with `@fleet-sdk/compiler 0.12.0` against the modified sources:

| name | old treeHash | new treeHash | size |
|---|---|---|---|
| `task_hash_v0` | `30f45206…` | unchanged | 23 b |
| `credential_v0` | `f22105b4…` | unchanged | 31 b |
| `chaincash_reserve_v0` | `792efb00…` | `fc92d9f2…` | 676 b |
| `chaincash_receipt_v0` | `18f0892c…` | `23238b11…` | 119 b |
| `chaincash_note_v0` | `3691ad8c…` | `83ecbe74…` | 494 b |
| `basis_reserve_v0` | `47612119…` | `f64d1a73…` | 586 b |
| `basis_token_reserve_v0` | `d24c02cb…` | `16b54c8c…` | 669 b |

`task_hash_v0` and `credential_v0` are unchanged — their sources were
not modified. The five vendored ChainCash / Basis trees are new bytes;
the manifest's `mainnetAllowed: false` defaults still apply to all of
them, so mainnet remains blocked until an external auditor signs the
post-fix manifest.

## Test counts

| Package | Before | After |
|---|---|---|
| `ergo-agent-pay` | 114 / 114 | **119 / 119** (+5: M-004 throws, M-006 OR, L-001 empty) |
| `ergo-agent-scripts` | 43 / 43 | **45 / 45** (+2: M-005 cross-check) |

## What still requires the auditor

* Cryptographic verification of compiler output against an interpreter
  (sigmastate-jvm / sigma-rust).
* Semantic review of the modified vendored sources — the fixes here are
  type-correct and compile cleanly, but only an interpreter can verify
  the on-chain semantics still match `intendedSemantics` in the manifest.
* Decision on H-001 (testnet variant) and M-002 / M-003 / M-007 residuals.
* Signing the post-fix `AUDITED_ERGOTREES.json` and flipping
  `mainnetAllowed` for approved entries.
