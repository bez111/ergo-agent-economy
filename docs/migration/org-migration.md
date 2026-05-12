# GitHub Organization Migration Note

Previous repository:

```text
github.com/bez111/accord-protocol
```

Current repository:

```text
github.com/accord-protocol/accord-protocol
```

## Why this moved

A neutral organization makes Accord look like an open protocol rather than a personal repository. It also separates:

- Accord Protocol open standard;
- AgentAccord commercial services;
- Ergo generic infrastructure;
- ChainCash/Basis reference work.

## What changed

- GitHub repository URL.
- GitHub Actions secrets.
- PyPI Trusted Publishing owner/repository settings.
- npm provenance metadata if used.
- Website links.
- README clone URL.
- GitHub Release location.

## What does not change

- Protocol object names.
- Package names.
- MIT license.
- Mainnet certification status.
- Audit-gated safety model.
- `AgentAccord` commercial separation.

## Remaining post-migration steps

1. Reconfigure GitHub Actions secrets under `accord-protocol/accord-protocol`.
2. Reconfigure PyPI Trusted Publishing for owner `accord-protocol`.
3. Update website links.
4. Confirm GitHub redirects from the old `bez111/accord-protocol` URL.
5. Publish a short migration note when release setup is complete.
