# Accord Protocol Professionalization Roadmap

This roadmap turns the current alpha monorepo into a professional open-source protocol repository.

## PR-001 — README trust cleanup

Goal: remove conflicting claims and make the README match status/security docs.

Changes:

- `only blockchain` -> `one of the few / first reference rail`.
- `No application-layer trust` -> `minimizes application-layer trust`.
- `ChainCash runs this stack on mainnet today` -> `reference implementation / not production certification`.
- `fatal flaw` table -> `where existing rails are strong and where Accord adds another layer`.
- `No MEV` -> eUTXO caveat.
- `Pay fees in any token` -> supported tokens when fee conversion exists.

## PR-002 — Status language sync

Goal: make `docs/status.md` the single source of truth.

Changes:

- mark all rails testnet-only unless signed manifests say otherwise;
- replace ambiguous `Stable` labels with `Maintained reference — not production-certified`;
- add current recommended usage;
- add mainnet certification checklist link.

## PR-003 — Publishing / release cleanup

Goal: remove confusion between `@accord-protocol/*` and `ergo-agent-*` packages.

Changes:

- update `PUBLISHING.md`;
- update `RELEASING.md`;
- document npm/PyPI gates;
- avoid advertising unpublished packages as already available.

## PR-004 — Example mode matrix

Goal: make examples safe and clear.

Changes:

- add mock/testnet/architecture/mainnet-certified matrix;
- mark every example `not mainnet certified` unless audit manifests say otherwise.

## PR-005 — Security contact + audit docs

Goal: improve trust.

Changes:

- improve `SECURITY.md`;
- add audit folder docs;
- define manifest format;
- define mainnet certification checklist.

## PR-006 — Maintainers + issue templates

Goal: make contribution flow professional.

Changes:

- add `MAINTAINERS.md`;
- add bug/spec/rail/security issue templates;
- add PR template.

## PR-007 — llms.txt refresh

Goal: stop AI/search systems from repeating stale claims.

Changes:

- rename to Accord Protocol reference;
- add current testnet/audit status;
- add preferred and forbidden wording.

## PR-008 — Org migration prep

Goal: prepare move to `github.com/accord-protocol/accord-protocol` after cleanup.

Changes:

- add migration plan;
- list post-migration action items;
- keep current repo until trust cleanup is done.
