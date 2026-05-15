# v0.4.1 release checklist and publication record

This page records the completed `v0.4.1` package publication and keeps the
same checklist useful for future `v0.4.x` patch releases.

A public package release is **not** production certification. Accord remains testnet-first and `NOT CERTIFIED FOR MAINNET` unless signed audit manifests explicitly mark relevant entries `mainnetAllowed: true`.

## Status

| Blocker | State | Owner |
|---|---|---|
| npm Trusted Publishing | Complete for the 18 npm packages published from `publish-npm.yml` | accord-protocol |
| npm registry verification | `npm run npm:publish-status` reports 18/18 package version(s) already published; 0 pending | accord-protocol |
| PyPI registry verification | `ergo-agent-pay==0.3.1` is available on PyPI | accord-protocol |
| `NPM_TOKEN` secret in repo | Not used for npm publish; Trusted Publishing/OIDC is the active path | accord-protocol |
| `publish-npm.yml` package matrix | Covers 10 `@accord-protocol/*` packages + 8 legacy npm packages | shipped |
| Publish jobs | npm prepublish gates run before any package publish; PyPI runs unit tests, builds dist, `twine check`, and wheel install smoke | shipped |
| Skip-if-already-published guard | Each npm job pre-checks via `npm view` | shipped |
| Self-conformance gate | L0+L1+L2+L3+L4 before publishing `@accord-protocol/conformance` | shipped |
| Package versions | Accord packages `0.4.1`; legacy/reference packages `0.3.1`; Python `0.3.1` | by design |
| External auditor signed manifest | No | external auditor |
| Mainnet status | `NOT CERTIFIED FOR MAINNET` | must remain true |

Publication evidence: [`docs/release-evidence/2026-05-15-npm-publish.md`](./release-evidence/2026-05-15-npm-publish.md).

## Package matrix

### Canonical Accord npm packages — `0.4.1`

- `@accord-protocol/core`
- `@accord-protocol/mcp`
- `@accord-protocol/gateway`
- `@accord-protocol/rails`
- `@accord-protocol/rails-ergo`
- `@accord-protocol/rails-rosen`
- `@accord-protocol/rails-base`
- `@accord-protocol/rails-x402`
- `@accord-protocol/conformance`
- `@accord-protocol/buyer-policy`

### Maintained reference npm packages — `0.3.1`

- `ergo-agent-pay`
- `ergo-agent-cli`
- `ergo-agent-api`
- `ergo-agent-mcp`
- `ergo-agent-server`
- `ergo-agent-scripts`
- `ergo-agent-rosen`
- `agentpay-base`

### Python package — `0.3.1`

- `ergo-agent-pay`

## Step 1 — configure npm publishing

Done for `v0.4.1`. For future packages, preferred setup is npm Trusted
Publishing for every npm package with:

- owner: `accord-protocol`;
- repository: `accord-protocol`;
- workflow filename: `publish-npm.yml`.

Fallback: create a granular npm token with publish access and bypass-2FA
enabled, or an Automation token if the npm account/org policy still supports
it. The npm account behind the token must be able to publish the
`@accord-protocol/*` scope and unscoped legacy packages.

## Step 2 — add `NPM_TOKEN` repo secret only as fallback

Skip this step when every npm package is configured for Trusted Publishing. The
current `v0.4.1` npm publish path uses Trusted Publishing/OIDC and does not rely
on `NPM_TOKEN`.

1. Go to `https://github.com/accord-protocol/accord-protocol/settings/secrets/actions`.
2. New repository secret.
3. Name: `NPM_TOKEN`.
4. Value: the npm publish token.

## Step 3 — configure PyPI Trusted Publishing

For future PyPI releases, configure a trusted publisher for the Python reference
package:

- PyPI Project Name: `ergo-agent-pay`
- Owner: `accord-protocol`
- Repository name: `accord-protocol`
- Workflow name: `publish-pypi.yml`
- Environment name: leave blank unless the workflow is later changed

The Python package is the Ergo-rail reference SDK. It is not the canonical Python Accord layer.

## Step 4 — local pre-flight

For PR branches, first commit and push the branch, then run the same release smoke with branch mode enabled:

```bash
npm run release:preflight -- --allow-branch
npm run release:preflight -- --allow-branch --pack
```

Expected: all gates pass, including the Python reference package tests, venv install smoke, and pilot result checks. The `--pack` run additionally builds every npm tarball, installs all 18 packages into a fresh temporary project, imports the 10 canonical `@accord-protocol/*` packages, and runs the packaged `accord-conformance` CLI from outside the repository root.

For the final tag candidate on `main`, run from repo root:

```bash
npm run release:preflight:pack
```

The preflight script covers the manual checks below. If it fails and you need to isolate a failing gate, run the equivalent commands directly:

```bash
npm install --include=optional
npm run build --workspaces --if-present
npm run cjs:check
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
npm run release:check
```

Then run Python tests:

```bash
cd packages/ergo-agent-py
python3 -m unittest discover -s tests -v
cd ../..
```

Then run conformance from the built local workspace:

```bash
npm run build -w @accord-protocol/conformance
node packages/accord-conformance/dist/cli.js run --levels L0,L1,L2,L3,L4
```

Then run the canonical demo:

```bash
npm run dev -w accord-paid-mcp-repo-audit-demo
```

Expected: full Accord lifecycle with Agreement, Verification Receipt, and Settlement Receipt.

## Step 5 — tag and push a future release

Only tag a future release after local pre-flight and CI are clean:

```bash
git checkout main
git pull --ff-only
git status
npm run release:check
git tag v0.4.1
git push origin v0.4.1
```

The tag triggers:

- `.github/workflows/publish-npm.yml`
- `.github/workflows/publish-pypi.yml`

## Step 6 — verify publishes

```bash
npm run npm:publish-status

npm view @accord-protocol/core version
npm view @accord-protocol/mcp version
npm view @accord-protocol/gateway version
npm view @accord-protocol/rails version
npm view @accord-protocol/rails-ergo version
npm view @accord-protocol/rails-rosen version
npm view @accord-protocol/rails-base version
npm view @accord-protocol/rails-x402 version
npm view @accord-protocol/conformance version
npm view @accord-protocol/buyer-policy version

npm view ergo-agent-pay version
npm view ergo-agent-cli version
npm view ergo-agent-api version
npm view ergo-agent-mcp version
npm view ergo-agent-server version
npm view ergo-agent-scripts version
npm view ergo-agent-rosen version
npm view agentpay-base version

python -m pip index versions ergo-agent-pay
```

## Step 7 — GitHub Release

Create or refresh a GitHub Release only after registry verification.

Release notes must include:

- Accord packages published at `0.4.1`;
- legacy/reference packages remain `0.3.1`;
- Python reference package remains `0.3.1`;
- `NOT CERTIFIED FOR MAINNET` warning;
- link to `docs/status.md`;
- link to `SECURITY.md`;
- changelog excerpt.

## What the publish workflow does not do

- Does not flip `mainnetAllowed: true`.
- Does not imply ChainCash/Basis scripts are audited.
- Does not certify production use.
- Does not publish a canonical Python Accord layer.
- Does not modify repository ownership or organization settings.
