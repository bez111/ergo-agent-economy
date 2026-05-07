# Releasing

How a new version of Accord Protocol reaches npm and PyPI.

## Versioning

All seven TypeScript packages and the one Python package share a single
version number. Bumps are coordinated — when one package needs a change
that affects its on-disk shape (e.g., audit gate semantics) every
downstream package gets the same minor bump.

```
ergo-agent-pay        \
ergo-agent-cli         |
ergo-agent-api         |  same version, always bumped together
ergo-agent-mcp         |
ergo-agent-server      |
ergo-agent-scripts     |
ergo-agent-rosen      /
ergo-agent-pay (py)
```

## Pre-release checklist

For every release branch (`release/v0.X.0`):

1. `npm install` at repo root — confirms the workspace resolves cleanly.
2. `npm run build --workspaces` — every package builds.
3. `npm test --workspaces` — every package's tests pass.
4. `cd packages/ergo-agent-py && python3 -m unittest discover -s tests -v`
   — Python tests pass.
5. `npm run verify-predicates -w ergo-agent-scripts` — registry hashes
   match committed trees.
6. CHANGELOG entry under `## [Unreleased]` is non-empty and ordered
   newest at top.
7. SECURITY.md banner is correct for the release status.
8. `data/AUDITED_ERGOTREES.json` `mainnetAllowed` flags reflect the
   external auditor's signed manifest. **No mainnet promotion** without
   the auditor's signature on the corresponding commit.

## Cutting a release

From an up-to-date `main`:

```bash
# 1. Bump versions across the seven TS packages and the Python one.
node -e "
  const fs=require('node:fs');
  const v='0.X.0';
  for (const p of ['ergo-agent-pay','ergo-agent-cli','ergo-agent-api','ergo-agent-mcp','ergo-agent-server','ergo-agent-scripts','ergo-agent-rosen']) {
    const path='packages/'+p+'/package.json';
    const j=JSON.parse(fs.readFileSync(path,'utf-8'));
    j.version=v;
    for (const sec of ['dependencies','peerDependencies']) {
      if (!j[sec]) continue;
      for (const k of Object.keys(j[sec])) {
        if (k.startsWith('ergo-agent-')) j[sec][k]='^'+v;
      }
    }
    fs.writeFileSync(path, JSON.stringify(j,null,2)+'\n');
  }
"
# Update Python version manually:
#   - packages/ergo-agent-py/pyproject.toml
#   - packages/ergo-agent-py/ergo_agent_pay/__init__.py

# 2. Update CHANGELOG.md: rename [Unreleased] to [v0.X.0] - YYYY-MM-DD,
#    then add a fresh empty [Unreleased] section above it.

# 3. Commit on a release branch and open a PR.
git checkout -b release/v0.X.0
git add -A && git commit -m "chore(release): v0.X.0"
git push -u origin release/v0.X.0
gh pr create --title "chore(release): v0.X.0"

# 4. After the PR merges to main, cut the tag.
git checkout main && git pull
git tag v0.X.0
git push origin v0.X.0
```

## What the tag triggers

`v*` tags fire two GitHub Actions workflows:

* **`publish-npm.yml`** — publishes every TS workspace package in
  dependency order. `ergo-agent-pay` and `ergo-agent-scripts` go first
  (foundation), then the dependents in parallel. A foundation failure
  short-circuits dependents via `needs:`.
* **`publish-pypi.yml`** — publishes the Python `ergo-agent-pay`
  package via [PyPI Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
  (no API token; the GitHub workflow is registered as the trusted
  publisher).

## Required GitHub secrets

| Secret | Where used | How to obtain |
|---|---|---|
| `NPM_TOKEN` | `publish-npm.yml` | https://www.npmjs.com/settings/<account>/tokens — create an **Automation** token, paste under repo `Settings → Secrets and variables → Actions`. |

PyPI uses Trusted Publishing instead of a static token. Configure once
at https://pypi.org/manage/account/publishing/ with:

* Owner: `bez111`
* Repository name: `accord-protocol`
* Workflow filename: `publish-pypi.yml`
* Environment name: leave blank or set to `pypi`

## After publishing

1. Verify on registries:
   * `npm view ergo-agent-pay version` — should show `0.X.0`
   * `npm view ergo-agent-rosen version` — same
   * `pip show ergo-agent-pay` — same
2. Cut a GitHub Release pointing at the tag with the CHANGELOG snippet.
3. (Optional) Post the release notes to the project's social channels
   once they exist.

## Rolling back a bad release

`npm` does not allow re-publishing the same version. To recover:

1. Bump to `0.X.1` with the fix.
2. Cut a fresh tag.
3. (Optional, for ≤72h) `npm deprecate ergo-agent-pay@0.X.0 "Critical bug — use 0.X.1+"`.

Do **not** unpublish unless legally required; unpublishing breaks
downstream installs irrecoverably.

## Audit-state interaction

If a release flips `mainnetAllowed: true` for any audited ergoTree, the
release commit must also include the auditor's signed
`AUDITED_ERGOTREES.json`. The CHANGELOG entry must call this out
explicitly:

> ### v0.X.0 — Audited mainnet promotion
> * `credential_v0` and `chaincash_reserve_v0` are now `mainnetAllowed: true` per signed manifest at commit `<sha>`.
> * Auditor: `<name>` (`<contact>`).
> * Signed payload hash: `<hash>`.
