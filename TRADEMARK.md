# Trademark policy

| Status | v0 — pre-registration |
|---|---|
| Last updated | 2026-05-07 |

## TL;DR

- Anyone can **implement** Accord Protocol — it's MIT-licensed.
- Only implementations that **pass the conformance suite** can claim
  *"Accord-compatible"*.
- The names *"Accord Protocol"*, *"AgentAccord"*, and the conformance
  badges are trademarks of AgentAccord. Using them requires either
  passing conformance (for the badges) or being AgentAccord (for the
  company brand).

## What is and isn't covered

| | Covered by trademark | Free to use |
|---|---|---|
| The wire format, schemas, RFCs | — | ✓ |
| The reference SDK code (MIT) | — | ✓ |
| Forks, derivative implementations | — | ✓ (see naming rules below) |
| The names "Accord Protocol", "AgentAccord" | ✓ | only as described below |
| The conformance badges (see §3) | ✓ | only after passing conformance |

The protocol itself — the schemas, the wire shape, the cryptographic
constructions — is **open**. Trademark covers the *names and badges*,
not the technical work.

## Naming your implementation

You can:

- ✓ Say *"this is an Accord Protocol implementation"* descriptively.
- ✓ Say *"compatible with Accord Protocol"* if your implementation
  actually is.
- ✓ Use *"accord"* in your package name or product name (e.g.
  `my-accord-gateway`, `acmecorp-accord-rails`) as long as it's clear
  you are not AgentAccord. We recommend a vendor prefix.

You cannot:

- ✗ Name your product or company *"Accord Protocol"*, *"Accord"* alone,
  or *"AgentAccord"*.
- ✗ Use the AgentAccord logo or wordmark.
- ✗ Imply that your implementation is endorsed by AgentAccord without
  written permission.
- ✗ Use the *"Accord-compatible"* / *"Accord/MCP certified"* /
  *"Accord/402 certified"* / *"Accord Rails certified"* / *"Accord
  Verified Provider"* / *"Accord Verified Verifier"* badges unless your
  implementation passes the corresponding conformance level.

## Conformance badges

The conformance suite (`@accord-protocol/conformance`, lands in PR-017+)
defines five levels:

```text
L0  Schema-compatible      — Accord objects validate against schemas/v0
L1  Transport-compatible   — Accord/402 or Accord/MCP roundtrip works
L2  Rail-compatible        — at least one rail adapter passes verifyPayment + settle
L3  Security-compatible    — production-safety gates fire on mainnet writes
L4  Registry-certified     — listed in the public registry with passing conformance
```

The badge text MUST quote the level you achieved:

- *"Accord-compatible (L0 schema)"* — passes L0.
- *"Accord/MCP certified (L1)"* — passes L0 and L1 with the MCP transport.
- *"Accord/402 certified (L1)"* — passes L0 and L1 with the HTTP transport.
- *"Accord Rails certified (L2)"* — passes L0, L1, and L2 with at least
  one rail.
- *"Accord-compatible"* without a level qualifier is fine **only** if
  your implementation passes every level applicable to its surface
  (e.g. an MCP-only implementation that passes L0–L2 can drop the
  qualifier).

### How to claim a badge

1. Run `npx accord-conformance --target <your endpoint>` (the CLI ships
   in `@accord-protocol/conformance`).
2. Capture the output. The CLI emits a JSON-shaped result that names
   each level pass/fail.
3. Publish the result alongside your implementation. The
   `accord-protocol/registry` repo (PR-021) accepts conformance-result
   submissions for inclusion in the public registry.

If your conformance result drifts later (a regression) and you don't
update the published result, the registry will eventually mark your
entry as `revoked`. Keep the result fresh — re-run conformance on every
release.

## Names you can NOT use

Reserved names — even with prefixes / suffixes:

```text
Accord            — by itself
Accord Protocol
AgentAccord
Accord Foundation
The Accord Network
```

## How to ask for an exception

Email the maintainer. Include what you want to use, where, and for how
long. Reasonable asks for ecosystem use (Show HN posts, conference
talks, blog posts demonstrating the protocol) are usually fine and
don't need formal approval; what we want to prevent is naming
collisions that would confuse users about what is and isn't
the official protocol / company.

## Trademark enforcement

v0 of this policy is best-effort. We will:

- Ask politely if a project is using a reserved name.
- Escalate to a takedown only if the name actively confuses users about
  the source of the work (e.g. an account squatting on
  `agentaccord/*` repos and claiming to be the company).

This document will be replaced with a formal policy when AgentAccord
files trademark registrations. Until then, treat the rules above as
**intent**, not enforceable trademark.

## Future state

After trademark registration:

- A short, formal *Acceptable Use Policy* replacing this file.
- A list of officially licensed certifications (with dates).
- The conformance registry as the authoritative source for who passes
  which level.

For now: build whatever you want, name it descriptively, run
conformance before claiming compatibility.
