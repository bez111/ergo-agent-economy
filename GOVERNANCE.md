# Governance

| Status | v0 — maintainer-led, public RFC process |
|---|---|
| Last updated | 2026-05-07 |

## What this document covers

How decisions about Accord Protocol get made: who can change the spec,
how breaking changes work, who handles security reports, and what the
relationship is between the open standard and the AgentAccord company.

## What this is NOT

- **Not** a foundation charter or a DAO bylaw. Accord Protocol is too
  young for either — the spec is still in v0 draft, the schemas are
  still moving. Heavy governance now would slow down the work that
  matters (getting the protocol stable, reaching v1).
- **Not** the trademark policy — see [TRADEMARK.md](TRADEMARK.md).
- **Not** the security disclosure process — see [SECURITY.md](SECURITY.md).

## v0 governance model — maintainer-led

The protocol is currently maintained by **bez111** (the original author)
and contributors who have shipped at least one merged change. There is no
formal maintainer roster yet; that's a v1 problem.

Day-to-day decision rules:

| Change | Process |
|---|---|
| Bug fix in core / mcp / gateway / rails packages | Standard PR; one maintainer review enough. |
| Test or example addition | Standard PR. |
| Spec clarification (no semantic change) | PR to `specs/ACCORD-*.md`; mention the affected RFC in the title. |
| **Spec semantic change** | PR + a paragraph in the body explaining the change, the reasoning, and what existing implementations need to do. |
| **Breaking schema change** | Bump the affected object type (e.g. `accord.agreement.v0` → `accord.agreement.v1`); v0 stays supported for one minor SDK cycle. |
| New rail adapter | New package under `packages/accord-rails-<rail>/`; must pass conformance L0–L2. |
| New conformance level | RFC update + matching tests in `@accord-protocol/conformance`. |
| Security fix | See [SECURITY.md](SECURITY.md) — out-of-band, then public. |

## Versioning

The protocol follows two version axes that move on different cadences:

- **Object version** (`v0`, `v1`, …) — embedded in `type` / `version`
  fields of every protocol object. Bumps only on breaking schema
  changes. The Accord SDKs reject objects whose `version` they don't
  understand unless an explicit `--accept-unknown` flag is set.
- **SDK version** (npm `0.4.x`, `0.5.x`, …) — semver on the implementation.
  A new SDK can support multiple object versions side-by-side.

The current state is documented in [`docs/status.md`](docs/status.md).

## RFC process

Each spec lives in `specs/ACCORD-NNN-<slug>.md`. New RFCs follow this
flow:

1. **Draft** — open a PR adding `specs/ACCORD-NNN-<slug>.md` with status
   `Draft`. Iterate on review.
2. **Last call** — once review converges, mark status `Last Call` and
   wait at least 3 working days for objections.
3. **Stable** — flip status to `Stable` when no blocking objection
   remains. Stable RFCs get matching JSON Schemas in `schemas/` and
   conformance tests in `@accord-protocol/conformance` before the next
   SDK release.

Drafts can — and do — break compatibility. Stable RFCs cannot break
compatibility within their object-version line; breaking changes wait for
the next object version.

## Security changes outweigh compatibility

Where a security finding requires a breaking schema or wire change, the
maintainers ship the fix on the existing object-version line and treat
it as a coordinated disclosure. The reasoning + timeline get a public
post-mortem in `docs/audit/`. Compatibility is important; staying secure
is more important.

## Relationship to AgentAccord (commercial)

Accord Protocol is the open standard. **AgentAccord** is the company
operating commercial infrastructure on top of it (hosted gateway,
marketplace, verifier routing, private registries, dashboards).

Strict separation:

- **AgentAccord** does not control the spec. Anyone can implement
  Accord Protocol and ship products without involving AgentAccord.
- **Accord Protocol** does not bake AgentAccord-only features into the
  spec. A clean third-party implementation must be possible.
- **Conformance certification** lives in this repo (the `@accord-protocol/conformance`
  package) and is checked by anyone, not gated by AgentAccord.

The trademark policy (`TRADEMARK.md`) covers when the *names* "Accord
Protocol" / "AgentAccord" / the conformance badges may be used.

## How to propose a change

1. Open an issue describing the problem you're solving and the rough
   shape of the fix. Wait for maintainer triage if the change touches
   the spec or a security boundary.
2. Open a PR. Reference any RFC the change touches in the title. Update
   the affected RFC in the same PR.
3. If the change is a **breaking** spec change, write the migration
   story for downstream implementations in the PR description.

## How to become a maintainer

Ship work. After enough merged changes that you're effectively reviewing
your own code, ask. v0 doesn't have a formal voting process — once a
maintainer pings you for review on PRs, you're effectively a maintainer.
This will be replaced with a real process (Technical Steering Group,
verifier council) when v1 stabilises.

## Forking

Accord Protocol is MIT-licensed. Forks are allowed, encouraged where
they push the spec forward, and especially encouraged for experimental
v1 work. The trademark policy still applies — a fork can't claim to be
"Accord Protocol" without passing conformance, and can't use the
"Accord-compatible" badge without running the conformance suite.

See [TRADEMARK.md](TRADEMARK.md) for details.

## Future governance (v1+)

When the spec stabilises (target: stable v0 → v1 transition), this file
gets replaced with:

- a Technical Steering Group with a documented voting process;
- a Verifier Council that ratifies new verifier identities in the public
  registry;
- an Audit Review Board that signs the rail-specific audited manifests
  (`AUDITED_ERGOTREES.json`, `AUDITED_CONTRACTS.json`).

Treat anything beyond that as TBD. The point of v0 governance is to ship
a working spec, not to design committees.
