# CI and Workflow Guide

This document explains the intended role of Accord Protocol GitHub Actions workflows.

## Workflow categories

| Category | Purpose |
|---|---|
| Core CI | Build and test protocol packages |
| Rail CI | Build/test rail adapters such as Ergo, Rosen, Base, x402 |
| Conformance CI | Run Accord conformance checks |
| Python CI | Test Python reference package |
| Demo CI | Ensure examples still run or compile |
| Release readiness CI | Build workspaces, smoke CommonJS exports, then run root typecheck plus `release:check`, `audit:check`, and `site:check` |
| Publish workflows | Publish npm/PyPI packages after a release tag |

## Merge expectations

For changes touching protocol, security, schemas, rails, or release files:

- relevant CI should pass;
- release readiness CI should pass when docs, examples, package metadata, scripts, or site assets change;
- conformance should pass when object shape changes;
- `docs/status.md` must stay accurate;
- `SECURITY.md` must be updated if risk posture changes;
- no PR should imply mainnet certification without signed audit manifests.

## Release expectations

Release tags should run publishing workflows only after:

- package versions are updated;
- `CHANGELOG.md` is updated;
- `npm run release:preflight:pack` passes on `main`;
- npm/PyPI publishing credentials are configured;
- status docs agree with release posture;
- audit manifests remain safe by default.

## Branch protection recommendation

Recommended future branch protection for `main`:

- require pull request before merging;
- require status checks for core CI and conformance;
- require review for changes under `specs/`, `schemas/`, `SECURITY.md`, `docs/audit/`, and audit manifest files;
- prevent force-pushes;
- optionally require signed commits for release branches.
