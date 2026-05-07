# v0.4.0 release checklist

What needs to happen before `git tag v0.4.0 && git push --tags` actually
publishes anything to npm or PyPI.

## Status

| Blocker | State | Owner |
|---|---|---|
| `NPM_TOKEN` secret in repo | **NOT SET** (0 secrets configured) | bez111 |
| PyPI Trusted Publishing config | **NOT CONFIGURED** for `accord-protocol` | bez111 |
| `publish-npm.yml` covers new packages | **DONE** (covers all 9 `@accord-protocol/*` plus 8 legacy) | shipped |
| Skip-if-already-published guard | **DONE** (each job pre-checks via `npm view`) | shipped |
| Self-conformance gate (L0+L1+L2+L3+L4) on the conformance publish job | **DONE** | shipped |
| All package.json versions in sync at 0.4.0 | **PARTIAL** (new packages 0.4.0, legacy 0.3.0 — by design) | bez111 to confirm |
| External auditor signed manifest | **NO** | external auditor |

## Step 1 — Create npm access token

1. Sign in to https://www.npmjs.com/
2. Settings → Access Tokens → Generate New Token → "Automation" type
3. Scope: publish for the npm org / packages you'll publish under
4. Copy the token. It starts with `npm_…`.

## Step 2 — Add `NPM_TOKEN` repo secret

1. https://github.com/bez111/accord-protocol/settings/secrets/actions
2. New repository secret. Name: `NPM_TOKEN`. Value: the token from step 1.
3. Save.

## Step 3 — Configure PyPI Trusted Publishing

1. Sign in to https://pypi.org/
2. https://pypi.org/manage/account/publishing/
3. Add a new publisher:
   - **PyPI Project Name**: `ergo-agent-pay` (the existing PyPI package name; renaming requires a new package)
   - **Owner**: `bez111`
   - **Repository name**: `accord-protocol`
   - **Workflow name**: `publish-pypi.yml`
   - **Environment name**: leave blank
4. Save.

> **Note on PyPI rename**: the Python package keeps its `ergo_agent_pay` name on PyPI even though the GitHub repo is now `accord-protocol`. Renaming on PyPI is non-trivial and out of scope for v0.4.0.

## Step 4 — Pre-flight locally

```bash
# 1. Confirm versions match what you intend
$ grep -h '"version"' packages/*/package.json | sort -u

# 2. Build everything end-to-end
$ npm install --include=optional
$ npm run build --workspaces --if-present
$ npm test --workspaces --if-present

# 3. Run the full conformance suite
$ npx accord-conformance run --levels L0,L1,L2,L3,L4
# Expected: Achieved: L4

# 4. Run the demo
$ npm run dev -w accord-paid-mcp-repo-audit-demo
# Expected: full Accord lifecycle, both receipts valid
```

## Step 5 — Tag and push

```bash
# Pre-flight: branch is main, tree is clean, all CI green on main
$ git checkout main
$ git pull --ff-only
$ git status

# Tag and push. The push triggers BOTH workflows:
#   - .github/workflows/publish-npm.yml  (17 jobs, topological order)
#   - .github/workflows/publish-pypi.yml (1 job)
$ git tag v0.4.0
$ git push origin v0.4.0
```

## Step 6 — Verify the publishes

```bash
# npm — new Accord layer
$ npm view @accord-protocol/core version            # should be 0.4.0
$ npm view @accord-protocol/mcp version             # 0.4.0
$ npm view @accord-protocol/gateway version         # 0.4.0
$ npm view @accord-protocol/rails version           # 0.4.0
$ npm view @accord-protocol/rails-ergo version      # 0.4.0
$ npm view @accord-protocol/rails-rosen version     # 0.4.0
$ npm view @accord-protocol/rails-base version      # 0.4.0
$ npm view @accord-protocol/rails-x402 version      # 0.4.0
$ npm view @accord-protocol/conformance version     # 0.4.0

# npm — legacy layer (no-op if already published at 0.3.0)
$ npm view ergo-agent-pay version                   # 0.3.0
$ npm view ergo-agent-mcp version                   # 0.3.0

# PyPI
$ pip show ergo-agent-pay
```

## Skip-if-already-published guard

Every job in `publish-npm.yml` does this before `npm publish`:

```bash
LOCAL=$(node -p "require('./packages/<pkg>/package.json').version")
if npm view "<pkg>@$LOCAL" version >/dev/null 2>&1; then
  echo "<pkg>@$LOCAL already on npm; skipping."
else
  npm publish --workspace <pkg> --access public
fi
```

So re-tagging `v0.3.0` (or any version that's already on npm for a given package) is safe — those jobs no-op. Only NEW versions get published. This makes the workflow safe to re-run on tag-push retries.

## Rollback

`npm` does not support deleting versions for security reasons. To roll back a bad release:

1. Bump to `v0.4.1` with the fix
2. Deprecate the bad `v0.4.0` versions: `npm deprecate "<pkg>@0.4.0" "use 0.4.1 — see CHANGELOG"`
3. Bump the tag and re-publish

## What the publish workflow does NOT do

- **Does not flip `mainnetAllowed: true` in any audit manifest.** That requires an external auditor signature — see [`docs/audit/SIGNING_PLAYBOOK.md`](audit/SIGNING_PLAYBOOK.md).
- **Does not rename the PyPI package.** `ergo_agent_pay` stays the published name on PyPI.
- **Does not publish to the Accord-Protocol-branded npm org** (we don't have one). Packages live under `@accord-protocol/*` on the public npm registry.
