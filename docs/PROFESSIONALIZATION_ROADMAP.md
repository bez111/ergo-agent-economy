# Accord Protocol Professionalization Roadmap

Last updated: 2026-05-15

This roadmap turns the current alpha monorepo into a professional open-source protocol repository that can support public contributors, external auditors, testnet pilots, and eventually a controlled mainnet launch.

The guiding rule is simple: ship useful developer infrastructure now, but keep every real-funds path default-deny until signed audit manifests explicitly allow it.

## Operating principles

1. `docs/status.md` is the source of truth for maturity, mainnet status, and recommended usage.
2. All rails remain testnet-only until external audit evidence updates the relevant signed manifest.
3. Every published package must be installable from a clean checkout and usable outside the monorepo.
4. The conformance suite is the compatibility contract for third-party implementations.
5. AgentAccord commercial products stay separate from the open Accord Protocol standard.

## Current execution state

As of 2026-05-15, the stabilization work is being staged on the
`p0-stabilization-roadmap` branch. Local commits should stay small and
reviewable; push only after the final verification pass is clean.

| Phase | Current state | Evidence on branch |
|---|---|---|
| P0 Repository stabilization | Mostly complete locally | root build/test/typecheck path repaired, release preflight aligned, CJS/path/package data fixes committed |
| P1 Audit readiness | Implemented locally | audit docs, audit handoff scripts, manifest checks, and `npm run audit:check` gate committed |
| P2 Protocol hardening | Implemented locally for v0 | schema hardening, receipt parent-binding validation, registry/buyer-policy semantics, and conformance negatives committed |
| P3 Developer experience | In progress | package matrix, full example-mode matrix, safer legacy/mainnet wording, `noteBoxId` DX, Rosen example cleanup, and example 16 CI coverage committed |
| P4 Testnet pilots | Not started | needs written pilot runs and signed sample receipts after PR/CI |
| P5 Controlled mainnet launch | Blocked by design | requires external audit reports and signed manifests with exact `mainnetAllowed: true` entries |

Immediate remaining work before opening a PR:

- run a final full verification pass from a clean working tree;
- review launch/announcement docs for claims that imply production or mainnet certification;
- decide whether Rosen example 11 should become a workspace once its external TokenMap dependencies are suitable for clean CI;
- prepare the PR body with command evidence and the P0-P3 scope boundary.

## Phase P0 - Repository stabilization

Goal: make the repository trustworthy to clone, install, build, test, and read.

Scope:

- keep README, status, security, release, and LLM-facing docs consistent;
- make `npm test` work from a clean checkout by building package artifacts first;
- make CJS and ESM package entrypoints work where packages advertise both formats;
- make `@accord-protocol/conformance` self-contained after npm packaging;
- keep release checks aligned with the current publish workflow;
- remove accidental local-only assumptions from package scripts and CLIs.

Acceptance criteria:

- `npm install` or `npm ci` completes without project-caused engine conflicts;
- `npm run build` succeeds;
- `npm test` succeeds from the repository root;
- `npm run typecheck` succeeds;
- `npm run release:check` succeeds;
- `npm run site:check` succeeds;
- Python tests pass for `packages/ergo-agent-py`;
- CommonJS smoke tests pass for all packages that advertise CJS exports;
- `@accord-protocol/conformance` can run from outside the repository root.

Suggested GitHub milestone: `P0 Repository Stabilization`

Suggested issues:

- Fix CJS runtime path resolution for packaged data files.
- Package conformance schemas, registry, and test vectors with the CLI.
- Make root test command clean-checkout safe.
- Reconcile release preflight with idempotent manual npm workflow reruns.
- Remove optional Rosen token registry from default workspace installation.

## Phase P1 - Audit readiness

Goal: make the external audit path explicit, reproducible, and reviewable.

Scope:

- freeze the audit input set for Ergo scripts, Base contracts, schemas, and rail adapters;
- produce signed or signable manifests for every mainnet-sensitive artifact;
- document verifier assumptions, wallet assumptions, bridge assumptions, and facilitator assumptions;
- ensure dangerous override flags are noisy, searchable, and absent from examples;
- add a repeatable auditor handoff bundle.

Acceptance criteria:

- `docs/audit/AUDITOR_REQUEST.md` names exact artifacts and expected outputs;
- manifest formats cover tree hashes, bytecode hashes, source revisions, audit status, and `mainnetAllowed`;
- pre-audit findings are either fixed or tracked as explicit accepted risks;
- each mainnet gate has at least one negative test proving default-deny behavior;
- every real-funds path links back to `SECURITY.md` and `docs/status.md`.

Suggested GitHub milestone: `P1 Audit Readiness`

Suggested issues:

- Finalize Ergo ErgoTree manifest signing workflow.
- Finalize Base/EVM contract manifest signing workflow.
- Add negative tests for all mainnet safety gates.
- Create auditor handoff archive script.
- Add threat model coverage for verifier compromise and replay.

## Phase P2 - Protocol hardening

Goal: make Accord v0 stable enough for independent implementations.

Scope:

- freeze v0 object schemas for Agreement, Verification Receipt, and Settlement Receipt;
- expand conformance vectors for malformed inputs, replay windows, settlement mismatch, and registry mismatch;
- define compatibility rules for minor SDK releases;
- make buyer policy behavior explicit and testable;
- clarify registry semantics and versioning.

Acceptance criteria:

- every stable RFC has matching JSON Schema and conformance cases;
- conformance levels L0-L4 have documented pass/fail semantics;
- package APIs expose stable, typed inputs for core protocol objects;
- examples use protocol objects consistently instead of ad hoc payloads;
- registry entries can be validated without private infrastructure.

Suggested GitHub milestone: `P2 Protocol v0 Hardening`

Suggested issues:

- Freeze Accord Agreement v0 schema.
- Add replay and nonce conformance vectors.
- Add registry mismatch conformance vectors.
- Document buyer policy decision semantics.
- Publish compatibility policy for `0.x` SDK releases.

## Phase P3 - Developer experience and adoption

Goal: make the project understandable and pleasant for outside builders.

Scope:

- improve quickstarts for mock rail, Accord/402, Accord/MCP, and conformance;
- separate legacy `ergo-agent-*` guidance from canonical `@accord-protocol/*` guidance;
- publish a package matrix with install status, rail status, and mainnet status;
- keep examples mode-labeled as mock, testnet, architecture, or mainnet-certified;
- add issue templates and contributor workflows that route questions to the right place.

Acceptance criteria:

- a new developer can run the mock demo in under ten minutes;
- every example states whether it uses real chain access, real funds, or mainnet-certified code;
- docs do not imply that unpublished packages are already available from registries;
- `llms.txt` and README wording match `docs/status.md`;
- GitHub issues and PRs have templates for bugs, specs, rails, security-sensitive reports, and release work.

Suggested GitHub milestone: `P3 Developer Experience`

Suggested issues:

- Refresh quickstart around mock rail first.
- Add package availability matrix.
- Add conformance CLI quickstart for third-party implementers.
- Add example mode badges.
- Review docs for stale AgentAccord versus Accord wording.

## Phase P4 - Testnet pilots

Goal: validate real integrations without risking mainnet funds.

Scope:

- run controlled pilots for Accord/402 and Accord/MCP with mock and testnet rails;
- test Ergo, Rosen, Base/EVM, and x402 assumptions independently;
- collect verifier failure modes and policy false positives;
- capture operational runbooks for key rotation, manifest updates, and failed settlements.

Acceptance criteria:

- each pilot has a written scenario, expected receipts, and rollback plan;
- every pilot result includes conformance output and signed example receipts;
- verifier and settlement failures are classified and turned into tests where possible;
- no pilot requires disabling default mainnet safety gates.

Suggested GitHub milestone: `P4 Testnet Pilots`

Suggested issues:

- Run mock Accord/MCP paid tool pilot.
- Run Ergo testnet Note settlement pilot.
- Run Rosen wrapped-token architecture pilot.
- Run Base testnet contract rail pilot.
- Run x402 facilitator integration pilot.

## Phase P5 - Controlled mainnet launch

Goal: allow narrow, audited, explicitly certified mainnet usage.

Scope:

- enable `mainnetAllowed: true` only for artifacts covered by signed external audit evidence;
- publish release notes that name exactly which rails and scripts are certified;
- keep uncertified rails default-deny;
- run a low-limit launch with monitoring, incident process, and rollback instructions.

Acceptance criteria:

- external audit reports are linked from the relevant manifests;
- `mainnetAllowed: true` appears only for audited hashes;
- release artifacts are reproducible from a clean checkout;
- conformance and package smoke tests pass against the release tag;
- launch limits, incident contacts, and rollback procedures are public.

Suggested GitHub milestone: `P5 Controlled Mainnet Launch`

Suggested issues:

- Prepare audited release tag.
- Publish signed audit manifests.
- Add launch monitoring checklist.
- Add mainnet incident response runbook.
- Run post-launch conformance and receipt audit.

## Release train

The next release train should be:

1. Finish P0 fixes locally.
2. Push the stabilization branch to GitHub.
3. Open a PR with build, test, typecheck, release-check, site-check, and Python test evidence.
4. Cut `v0.4.0-rc.1` only after CI and registry credentials are ready.
5. Promote to `v0.4.0` only after package publishing and conformance packaging are verified from a clean install.

## Definition of done for this roadmap

The roadmap is complete when P0-P4 are done, at least one external audit has produced signed manifest updates, and P5 can proceed without changing the default-deny safety model.
