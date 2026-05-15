# Releasing

This document describes how a new Accord Protocol version reaches public package registries.

## Versioning model

Accord has two version axes:

1. **Protocol object version** — embedded in Accord objects, e.g. `v0`, `v1`. This changes only on breaking schema/object changes.
2. **SDK/package version** — npm/PyPI semver, e.g. `0.4.1`. This changes when implementation packages change.

The current status is tracked in [`docs/status.md`](docs/status.md).

## Release types

| Type | Example | Meaning |
|---|---|---|
| Development branch | `feature/...` | Not published |
| Release candidate | `release/v0.4.1` | Review and CI stage |
| Public package release | `v0.4.1` tag | npm/PyPI publication if configured |
| Mainnet-certified release | future | Requires signed external audit manifests |

A release can be public while still being testnet-only. Public package release is not the same as production certification.

## Pre-release checklist

Before opening a release PR:

1. Install dependencies at repo root.
2. Build all workspaces.
3. Run all workspace tests.
4. Run Python tests.
5. Run conformance tests.
6. Verify audit manifests.
7. Confirm `docs/status.md` says the correct mainnet status.
8. Confirm `SECURITY.md` is current.
9. Confirm `README.md` does not advertise unpublished packages as already published.
10. Update `CHANGELOG.md`.
11. Confirm npm/PyPI publishing setup.

Example commands may vary by package manager and workspace setup:

```bash
npm install
npm run build --workspaces
npm test --workspaces
cd packages/ergo-agent-py && python3 -m unittest discover -s tests -v
```

## Cutting a release

```bash
git checkout main
git pull
git checkout -b release/v0.4.1

# update versions and docs
git add -A
git commit -m "chore(release): v0.4.1"
git push -u origin release/v0.4.1
```

Open a PR. After CI passes and the PR is reviewed:

```bash
git checkout main
git pull
git tag v0.4.1
git push origin v0.4.1
```

## What the tag should trigger

- npm publication for `@accord-protocol/*` packages and maintained reference packages;
- PyPI publication for the Python package, if configured;
- conformance checks before publishing conformance-related packages;
- skip-if-already-published safeguards where implemented.

## Required release secrets and configuration

| Item | Required for | Notes |
|---|---|---|
| npm Trusted Publishing | npm packages | Preferred: GitHub Actions OIDC, no long-lived npm token |
| `NPM_TOKEN` | npm packages | Fallback only if Trusted Publishing is unavailable |
| PyPI Trusted Publishing | Python package | Must be configured against the correct owner/repo/workflow |
| GitHub Release permissions | Release notes | Usually available to maintainers/admins |

## After publishing

1. Verify registry versions.
2. Create GitHub Release with release notes.
3. Update docs/status.md if any item changed.
4. Publish a short announcement only after package availability is confirmed.

## Rollback

npm does not allow overwriting the same version. If a bad package ships:

1. Fix the issue.
2. Bump patch version.
3. Publish a new version.
4. Optionally deprecate the bad version with a clear message.

Do not unpublish unless legally required.

## Audit-state interaction

If any release flips `mainnetAllowed: true`, the same release must include:

- signed external audit manifest;
- script/bytecode hashes;
- auditor identity and contact or public report link;
- exact commit hash;
- changelog entry describing the mainnet promotion;
- updated `SECURITY.md` and `docs/status.md`.

Without this, `mainnetAllowed` must remain `false`.
