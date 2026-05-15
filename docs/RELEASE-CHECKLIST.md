# v0.4.0 release checklist

This checklist describes what must be true before `git tag v0.4.0 && git push origin v0.4.0`.

A public package release is **not** production certification. Accord remains testnet-first and `NOT CERTIFIED FOR MAINNET` unless signed audit manifests explicitly mark relevant entries `mainnetAllowed: true`.

## Status

| Blocker | State | Owner |
|---|---|---|
| `NPM_TOKEN` secret in repo | Configure before tag | accord-protocol |
| PyPI Trusted Publishing config | Configure before tag | accord-protocol |
| `publish-npm.yml` package matrix | Covers 10 `@accord-protocol/*` packages + 8 legacy npm packages | shipped / verify |
| Publish jobs | 18 npm jobs total; PyPI is separate | shipped / verify |
| Skip-if-already-published guard | Each npm job pre-checks via `npm view` | shipped |
| Self-conformance gate | L0+L1+L2+L3+L4 before publishing `@accord-protocol/conformance` | shipped |
| Package versions | Accord packages `0.4.0`; legacy/reference packages `0.3.0`; Python `0.3.0` | by design |
| External auditor signed manifest | No | external auditor |
| Mainnet status | `NOT CERTIFIED FOR MAINNET` | must remain true |

## Package matrix

### Canonical Accord npm packages — `0.4.0`

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

### Maintained reference npm packages — `0.3.0`

- `ergo-agent-pay`
- `ergo-agent-cli`
- `ergo-agent-api`
- `ergo-agent-mcp`
- `ergo-agent-server`
- `ergo-agent-scripts`
- `ergo-agent-rosen`
- `agentpay-base`

### Python package — `0.3.0`

- `ergo-agent-pay`

## Step 1 — create npm access token

1. Sign in to https://www.npmjs.com/
2. Settings → Access Tokens → Generate New Token → Automation token.
3. Ensure it can publish the `@accord-protocol/*` scope and unscoped legacy packages.
4. Copy the token.

## Step 2 — add `NPM_TOKEN` repo secret

1. Go to `https://github.com/accord-protocol/accord-protocol/settings/secrets/actions`.
2. New repository secret.
3. Name: `NPM_TOKEN`.
4. Value: the npm automation token.

## Step 3 — configure PyPI Trusted Publishing

Configure a trusted publisher for the Python reference package:

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

Expected: all gates pass. The `--pack` run additionally builds every npm tarball, installs all 18 packages into a fresh temporary project, and imports the 10 canonical `@accord-protocol/*` packages.

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

## Step 5 — tag and push

Only tag after local pre-flight and CI are clean:

```bash
git checkout main
git pull --ff-only
git status
npm run release:check
git tag v0.4.0
git push origin v0.4.0
```

The tag triggers:

- `.github/workflows/publish-npm.yml`
- `.github/workflows/publish-pypi.yml`

## Step 6 — verify publishes

```bash
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

Create a GitHub Release for `v0.4.0` only after registry verification.

Release notes must include:

- Accord packages published at `0.4.0`;
- legacy/reference packages remain `0.3.0`;
- Python reference package remains `0.3.0`;
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
