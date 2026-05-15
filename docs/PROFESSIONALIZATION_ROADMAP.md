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

As of 2026-05-15, the P0-P3 base and the `v0.4.1` package release have been
merged and published from `main`. Commits should stay small and reviewable, and
each pushed batch should preserve clean CI plus a clean local release preflight
when release surfaces change.

| Phase | Current state | Evidence on `main` |
|---|---|---|
| P0 Repository stabilization | Complete on `main` | root build/test/typecheck path repaired, release preflight aligned, CJS/path/package data fixes committed, final `npm run release:preflight:pack` passed on `main`, `v0.4.1` is tagged, and 18/18 npm package versions are published |
| P1 Audit readiness | Complete for pre-audit | audit docs, audit handoff scripts, manifest checks, and `npm run audit:check` gate committed |
| P2 Protocol hardening | Complete for v0 draft | schema hardening, receipt parent-binding validation, registry/buyer-policy semantics, and conformance negatives committed |
| P3 Developer experience | Complete for public review | package matrix, full example-mode matrix, safer legacy/mainnet wording, `noteBoxId` DX, Rosen example cleanup, example 16 CI coverage, contributor templates, public README wording cleanup, and release-readiness CI committed |
| P4 Testnet pilots | Started | pilot matrix, result template, testnet wallet setup, per-rail rollback plans, first local mock pilot result, machine-checked completed/pending pilot status, `npm run pilots:todo`, and Ergo testnet env preflight committed; external testnet pilot evidence still pending |
| P5 Controlled mainnet launch | Blocked by design | requires external audit reports and signed manifests with exact `mainnetAllowed: true` entries |

Immediate remaining work toward `1.0.0`:

- execute the remaining P4 pilot runbooks and archive dated result records when external testnet credentials and facilitator access are available;
- keep Rosen example 11 out of the root workspace until external TokenMap dependencies are suitable for clean CI;
- turn deterministic pilot failures into tests or tracked issues;
- preserve npm/PyPI publication evidence and Trusted Publishing settings for future `v0.4.x` patch releases;
- obtain external audit reports and signed manifest updates before any P5 mainnet promotion.

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
- `npm run cjs:check` succeeds after build;
- `npm run release:check` succeeds;
- `npm run release:preflight -- --allow-branch --pack` succeeds on a clean pushed PR branch;
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

The next release train should be P4 evidence-driven:

1. Keep `main` green after each pilot-readiness change.
2. Archive one dated result record per pilot.
3. Run `npm run release:preflight:pack` before any new tag.
4. Cut the next `v0.4.x` patch only when the pilot evidence or release tooling changes justify it.
5. Defer `v1.0.0` until P0-P4 are complete and external audit evidence can support P5 without weakening the default-deny safety model.

## Definition of done for this roadmap

The roadmap is complete when P0-P4 are done, at least one external audit has produced signed manifest updates, and P5 can proceed without changing the default-deny safety model.
