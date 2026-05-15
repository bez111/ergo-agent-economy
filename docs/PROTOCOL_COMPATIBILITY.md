# Protocol Compatibility Policy

Last updated: 2026-05-15

This document defines how Accord Protocol v0 changes are handled before the
first stable `v1` object line. The goal is to let independent implementers
track the protocol without guessing whether a repository change is a breaking
wire-format change, an SDK-only change, or a conformance tightening.

## Compatibility surfaces

Accord has four public compatibility surfaces:

1. Protocol objects: Agreement, Verification Receipt, and Settlement Receipt.
2. JSON Schemas and canonical test vectors.
3. Conformance levels L0-L4.
4. SDK package APIs under `@accord-protocol/*`.

The protocol objects are the highest-priority contract. SDK convenience APIs
may evolve, but they must not silently reinterpret existing valid protocol
objects.

## v0 object stability

The current object line is `version: "v0"` and the type literals are:

- `accord.agreement.v0`
- `accord.verification_receipt.v0`
- `accord.settlement_receipt.v0`

While v0 is still draft, maintainers may tighten validation for security,
canonicalization, or interoperability bugs. Any tightening must ship with:

- a spec note or validation-rule update;
- a JSON Schema update when structural validation can express it;
- at least one positive or negative test vector;
- conformance coverage or a protocol hardening check.

## Changes allowed in patch releases

Patch releases may:

- fix SDK bugs that preserve existing object semantics;
- add tests, docs, warnings, and conformance diagnostics;
- reject objects that were already invalid under the written spec;
- add non-normative examples;
- improve registry validation without changing record meanings.

Patch releases must not require a previously valid v0 object to change unless
the object was only accepted because of an implementation bug and the written
spec already required rejection.

## Changes allowed in minor releases

Minor releases may:

- add optional non-critical fields that do not start with `accord_`;
- add conformance cases for documented rules;
- add registry record kinds that do not change existing record meanings;
- add SDK APIs around existing protocol objects;
- deprecate SDK APIs with a documented migration path.

Unknown top-level extension fields are allowed only outside the reserved
`accord_` namespace. Fields starting with `accord_` are reserved for future
protocol-defined critical behavior and are rejected by v0 schemas and semantic
validators.

## Changes requiring a new object version

A new object version, for example `accord.agreement.v1`, is required for:

- renaming or removing a required field;
- changing canonicalization or hash input rules;
- changing the meaning of an existing enum value;
- changing money amount representation;
- changing the required hash algorithm for `agreement_hash`;
- making an optional field required for existing flows;
- adding critical semantics that old implementations would ignore.

New object versions must get new schemas, test-vector directories, and
conformance cases. v0 and a future v1 may coexist in the same SDK line when the
SDK can validate and hash them unambiguously.

## Conformance policy

The conformance suite is the executable compatibility contract:

- L0 covers schema and canonical vector compatibility.
- L1 covers transport shape.
- L2 covers rail adapter behavior against reference rails.
- L3 covers security guardrails.
- L4 covers registry shape and cross-reference validation.

A conformance result proves compatibility with the current draft v0 rules. It
does not certify mainnet safety, external audit completion, or commercial
quality.

## Registry policy

The registry is append-friendly and file-based in v0. Provider, verifier, rail,
manifest, and revocation records can be mirrored by downstream systems.

Registry rail records are descriptive. They help discovery and validation, but
they are not the audit authority for mainnet safety. The audit authority is the
per-rail manifest named by the registry entry and checked by the SDK safety
gates.

Revocations are append-only audit history. A restored provider or verifier
should publish a fresh record, not erase the revocation trail.

## Release checklist for protocol changes

Before merging a protocol-affecting change, maintainers should run:

```bash
npm run protocol:check
npm run audit:check
npm run release:check
```

If any object schema, canonicalization rule, or conformance vector changes, the
PR should explicitly say whether the change is patch-compatible, minor-compatible,
or requires a future object version.
