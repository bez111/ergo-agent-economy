# Accord Protocol site professional upgrade

This archive contains a full replacement for the static `site/` directory.

## Apply locally

From the repository root:

```bash
# Optional safety backup
cp -a site site.backup.$(date +%Y%m%d-%H%M%S)

# Extract this archive into the repository root
unzip -o accord-site-pro-upgrade.zip

# Validate and serve
npm run site:check
npm run site:serve
```

Then open http://127.0.0.1:4173/.

## What changed

- Premium dark fintech/developer-infrastructure visual system.
- Stronger hero positioning: "agreement layer for autonomous agent work".
- Manifesto-aligned sections: machine-readable terms, bounded authority, verification and receipts.
- Architecture, rail matrix, developer quickstart, trust language, FAQ and final CTA.
- SEO, Open Graph, JSON-LD, sitemap, robots, web manifest.
- LLM/agent surfaces: `/llms.txt`, `/llms-full.txt`, `/agents.txt`, `/.well-known/accord.json`.
- Explicit status language: `NOT CERTIFIED FOR MAINNET`.

## Important posture

This site intentionally does not claim production or mainnet readiness. It preserves the repository's testnet-first / audit-gated status language.
