# Publishing Guide

How to publish `ergo-agent-pay` to npm and PyPI.

---

## npm — ergo-agent-pay (TypeScript)

### First time setup

1. Create npm account: https://www.npmjs.com/signup
2. Generate token: https://www.npmjs.com/settings/tokens → "Automation" type
3. Add to GitHub repo secrets: Settings → Secrets → `NPM_TOKEN`

### Publish a release

```bash
# 1. Bump version in packages/ergo-agent-pay/package.json
# 2. Update CHANGELOG.md
# 3. Commit
git add -A && git commit -m "chore: release v0.3.0"

# 4. Tag — this triggers the publish workflow automatically
git tag v0.3.0
git push origin main --tags
```

GitHub Actions will run: typecheck → build → test → `npm publish`.

### Manual publish (if needed)

```bash
cd packages/ergo-agent-pay
npm install
npm run build
npm publish --access public
```

---

## npm — ergo-agent-mcp

Published automatically on the same `v*` tag, after `ergo-agent-pay` succeeds.

---

## PyPI — ergo-agent-pay (Python)

Uses OIDC Trusted Publishing (no API token needed):

### First time setup

1. Go to https://pypi.org/manage/account/publishing/
2. Add publisher:
   - Owner: `bez111`
   - Repository: `ergo-agent-economy`
   - Workflow: `publish-pypi.yml`
   - Environment: (leave blank)

That's it — no API key needed. GitHub's OIDC identity proves the publish is from your repo.

### Publish

Same tag as npm — `git tag v0.3.0 && git push --tags` triggers both npm and PyPI.

---

## Version sync

Keep versions in sync across:
- `packages/ergo-agent-pay/package.json`
- `packages/ergo-agent-mcp/package.json`
- `packages/ergo-agent-py/pyproject.toml`
- `packages/ergo-agent-py/ergo_agent_pay/__init__.py`
- `CHANGELOG.md`
