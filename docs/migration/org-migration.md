# GitHub Organization Migration Plan

Current repository:

```text
github.com/bez111/accord-protocol
```

Target repository:

```text
github.com/accord-protocol/accord-protocol
```

## Why migrate

A neutral organization makes Accord look like an open protocol rather than a personal repository. It also separates:

- Accord Protocol open standard;
- AgentAccord commercial services;
- Ergo generic infrastructure;
- ChainCash/Basis reference work.

## What changes

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

## Migration order

1. Complete README/status/security cleanup in the current repo.
2. Cut or prepare `v0.4.0` release only if release gates are ready.
3. Create `github.com/accord-protocol` organization.
4. Transfer repository.
5. Reconfigure GitHub Actions secrets.
6. Reconfigure PyPI Trusted Publishing.
7. Update website and docs links.
8. Confirm GitHub redirects.
9. Publish a short migration note.
