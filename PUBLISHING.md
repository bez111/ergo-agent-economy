# Publishing Guide

This guide covers publishing Accord Protocol packages and maintained reference rail packages.

Accord Protocol is testnet-first. Publishing a package to npm or PyPI does **not** mean any rail, script, contract, or integration is certified for production mainnet use.

## Package families

### Canonical Accord packages

Published under `@accord-protocol/*`:

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

### Maintained reference rail packages

Published under their historical names for compatibility:

- `ergo-agent-pay`
- `ergo-agent-cli`
- `ergo-agent-api`
- `ergo-agent-mcp`
- `ergo-agent-server`
- `ergo-agent-scripts`
- `ergo-agent-rosen`
- `agentpay-base`
- Python package: `ergo-agent-pay`

## Release gates before publishing

Before any public release:

1. `README.md`, `docs/status.md`, `SECURITY.md`, `RELEASING.md`, and `llms.txt` must agree on status.
2. `docs/status.md` must still say `NOT CERTIFIED FOR MAINNET` unless signed audit manifests prove otherwise.
3. All tests and conformance checks must pass.
4. The package version must match the release branch/tag plan.
5. `CHANGELOG.md` must contain a release entry.
6. npm and PyPI credentials must be configured.
7. Any package not actually published must not be advertised as installable in a misleading way.

## npm setup

1. Create or use an npm account.
2. Create an Automation token.
3. Add it to GitHub Actions secrets as `NPM_TOKEN`.
4. Confirm that each public package uses the correct `name`, `version`, `license`, `repository`, and `publishConfig.access`.

For scoped packages, ensure:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

## PyPI setup

Use PyPI Trusted Publishing where possible.

Configure a trusted publisher for:

- owner: `accord-protocol`;
- repository: `accord-protocol`;
- workflow filename: `publish-pypi.yml`;
- environment: blank or `pypi`, matching the workflow.

## Publishing flow

Do not publish directly from an unreviewed local workspace.

Recommended flow:

```bash
git checkout -b release/v0.4.1
# update versions, CHANGELOG, docs/status.md if needed
git add -A
git commit -m "chore(release): v0.4.1"
git push -u origin release/v0.4.1
# open PR, run CI, review status/security docs
# merge to main
git checkout main
git pull
git tag v0.4.1
git push origin v0.4.1
```

The tag should trigger npm and PyPI workflows. If publishing is not configured, do not tag a public release that implies packages are available.

## Post-publish verification

Run:

```bash
npm view @accord-protocol/core version
npm view @accord-protocol/gateway version
npm view @accord-protocol/rails-ergo version
npm view ergo-agent-pay version
python -m pip index versions ergo-agent-pay
```

Then create a GitHub Release with:

- status summary;
- install commands;
- links to `docs/status.md` and `SECURITY.md`;
- explicit `NOT CERTIFIED FOR MAINNET` warning;
- changelog excerpt.

## What must never be implied by publishing

Publishing a package must never imply:

- ChainCash/Basis scripts are audited;
- Accord is production-certified;
- mainnet writes are safe;
- x402 facilitators are trusted by default;
- any verifier is correct by default;
- any rail has identical trust assumptions.
