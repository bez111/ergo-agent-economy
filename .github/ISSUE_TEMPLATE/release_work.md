---
name: Release or publishing work
about: Track release, package, registry, or publishing readiness tasks
labels: release
---

## Goal

## Release surface

- [ ] npm package metadata
- [ ] npm publish workflow
- [ ] PyPI publish workflow
- [ ] package matrix / release docs
- [ ] release preflight
- [ ] registry or conformance artifacts
- [ ] GitHub release notes
- [ ] other

## Required checks

- [ ] `npm run release:check`
- [ ] `npm run audit:check`
- [ ] `npm run site:check`
- [ ] `npm run release:preflight -- --allow-branch --pack` if package or workflow behavior changed

## Credentials / external setup

- [ ] No credentials required
- [ ] `NPM_TOKEN` required
- [ ] PyPI Trusted Publishing required
- [ ] Other external setup required

## Safety posture

- [ ] This does not imply production mainnet certification.
- [ ] No audit manifest is promoted to `mainnetAllowed: true` without signed external audit evidence.

## Notes
