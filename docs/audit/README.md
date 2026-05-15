# Audit and Mainnet Certification

This folder documents how Accord Protocol treats audits, manifest signing, and mainnet certification.

## Current state

Accord Protocol is not certified for production mainnet use.

- Ergo scripts are draft-pre-audit.
- Base/EVM contracts are draft-pre-audit.
- ChainCash/Basis reference material is not a blanket production-safety guarantee.
- `mainnetAllowed` must remain `false` until an external audit signs the relevant manifest.

## What counts as audited?

A component is considered audited only when all of the following are true:

1. The exact source and compiled artifact are identified.
2. The exact hash is listed in a manifest.
3. An external auditor signs or publishes a report covering that artifact.
4. The manifest entry is updated to `mainnetAllowed: true`.
5. `docs/status.md`, `SECURITY.md`, and release notes are updated.

## What does not count as audited?

- A passing unit test.
- A passing conformance test.
- A testnet demo.
- A successful mainnet experiment.
- A claim in README.
- An unaudited ChainCash/Basis reference script.

## Related docs

- [`MANIFEST_FORMAT.md`](./MANIFEST_FORMAT.md)
- [`ASSUMPTIONS.md`](./ASSUMPTIONS.md)
- [`AUDITOR_REQUEST.md`](./AUDITOR_REQUEST.md)
- [`MAINNET_CERTIFICATION.md`](./MAINNET_CERTIFICATION.md)
- [`SIGNING_PLAYBOOK.md`](./SIGNING_PLAYBOOK.md)
- [`../PROTOCOL_COMPATIBILITY.md`](../PROTOCOL_COMPATIBILITY.md)
- [`../status.md`](../status.md)
- [`../../SECURITY.md`](../../SECURITY.md)

## Repeatable handoff

Maintainers should run the audit readiness checks before sending material to an external reviewer:

```bash
npm run audit:check
npm run audit:handoff -- --out dist/audit-handoff
```

The handoff script writes a `dist/audit-handoff/` directory with the exact files, sizes, and sha256 hashes included in the review packet. It refuses a dirty working tree unless `--allow-dirty` is passed for an explicitly marked draft handoff.
