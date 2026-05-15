# Contributing

Accord Protocol is an alpha, testnet-first open protocol repository for agent
payments. Contributions are welcome, but every contribution must preserve the
current safety posture: **NOT CERTIFIED FOR MAINNET** unless signed external
audit manifests explicitly mark the exact artifact `mainnetAllowed: true`.

Start with [`docs/status.md`](./docs/status.md). It is the source of truth for
what works, what is testnet-only, and what remains blocked.

## What To Work On

Good first areas:

- Accord object schemas, conformance vectors, and compatibility docs.
- Mock-rail, Accord/MCP, and Accord/402 demos.
- Testnet-only rail adapters and pilot runbooks.
- Package installability, release checks, and CI hardening.
- Documentation that makes risk boundaries clearer for outside builders.

Do not open public issues or PRs for private keys, exploit details, signer
exposure, bypasses of mainnet gates, or payment-proof forgery. Follow
[`SECURITY.md`](./SECURITY.md) instead.

## Issue Routing

Use the closest issue template:

- Bug reports: [`.github/ISSUE_TEMPLATE/bug_report.md`](./.github/ISSUE_TEMPLATE/bug_report.md)
- Spec/schema changes: [`.github/ISSUE_TEMPLATE/spec_change.md`](./.github/ISSUE_TEMPLATE/spec_change.md)
- Rail adapter proposals: [`.github/ISSUE_TEMPLATE/rail_adapter.md`](./.github/ISSUE_TEMPLATE/rail_adapter.md)
- Release/publishing work: [`.github/ISSUE_TEMPLATE/release_work.md`](./.github/ISSUE_TEMPLATE/release_work.md)
- Security-sensitive reports: do not file publicly; follow [`SECURITY.md`](./SECURITY.md)

## Pull Requests

Keep PRs small and reviewable. A good PR states:

- what changed;
- which package, spec, rail, example, or doc is affected;
- whether protocol compatibility changes;
- whether mainnet safety posture changes;
- which commands were run.

If your change touches public behavior, update the relevant docs and examples.
If it touches protocol objects, schemas, registries, or rails, include
conformance evidence.

## Local Checks

Run the smallest relevant set first, then broaden before review:

```bash
npm install --include=optional
npm run build --workspaces --if-present
npm run cjs:check
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
npm run release:check
npm run audit:check
npm run site:check
```

For protocol or rail changes, also run:

```bash
npm run build -w @accord-protocol/conformance
node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4
```

For release, packaging, workspace, or publish workflow changes, commit and push
the branch, then run:

```bash
npm run release:preflight -- --allow-branch --pack
```

The final tag candidate on `main` should use:

```bash
npm run release:preflight:pack
```

## Examples And Pilots

Every example or pilot must say whether it uses:

- mock rail only;
- local-only execution;
- testnet chain access;
- external facilitator or bridge access;
- mainnet-certified artifacts.

No example should imply production mainnet readiness unless the relevant signed
audit manifest contains the exact `mainnetAllowed: true` entry.

## Code Standards

- Node.js 18+ for TypeScript/JavaScript packages.
- Keep package entrypoints usable outside the monorepo.
- Prefer typed protocol objects over ad hoc payloads.
- Keep dependencies minimal and justified.
- Add tests when changing validation, conformance, payment policy, or rail
  safety behavior.
