# Publishing Guide

This guide covers publishing Accord Protocol packages and maintained reference rail packages.

Accord Protocol is testnet-first. Publishing a package to npm or PyPI does **not** mean any rail, script, contract, or integration is certified for production mainnet use.

## Current v0.4.1 publication status

As of 2026-05-15, the `v0.4.1` Accord npm package line and the `0.3.1`
maintained reference package line are published. `npm run npm:publish-status`
verifies 18/18 npm package versions as already published, and
`ergo-agent-pay==0.3.1` is available on PyPI as the Python reference package.

The publication evidence is archived in
[`docs/release-evidence/2026-05-15-npm-publish.md`](./docs/release-evidence/2026-05-15-npm-publish.md).

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
6. npm and PyPI publishing authority must be configured.
7. Any package not actually published must not be advertised as installable in a misleading way.

## npm setup

Preferred path: configure npm Trusted Publishing for every public npm package.
This avoids long-lived write tokens in GitHub Actions and uses OIDC from the
authorized workflow instead.

For each package on npmjs.com:

1. Open the package settings.
2. Add a Trusted Publisher for GitHub Actions.
3. Use owner `accord-protocol`, repository `accord-protocol`, and workflow
   filename `publish-npm.yml`.
4. Leave environment blank unless the workflow is updated to use a protected
   GitHub environment.

Fallback token path:

1. Create or use an npm account that is an owner or maintainer for every
   package being published.
2. Create a granular access token with publish access and bypass-2FA enabled,
   or an Automation token if the npm account/org policy still supports it.
3. Add it to GitHub Actions secrets as `NPM_TOKEN`.
4. Confirm that each public package uses the correct `name`, `version`,
   `license`, `repository`, and `publishConfig.access`.

If GitHub Actions fails with an npm `E404` during `npm publish` while `npm view`
shows older versions of the same package, treat it as an npm authentication or
package permission problem first. The token may authenticate but still lack
publish rights for the `@accord-protocol` scope or legacy package names.

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

Before tagging, check the public npm registry state:

```bash
npm run npm:publish-status
```

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
