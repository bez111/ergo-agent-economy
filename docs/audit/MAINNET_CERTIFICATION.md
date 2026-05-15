# Mainnet Certification Checklist

A rail, contract, script, or predicate can be considered for production mainnet use only after this checklist is complete.

## Checklist

- [ ] Threat model documented.
- [ ] `npm run audit:check` passes.
- [ ] `npm run audit:handoff -- --out dist/audit-handoff` produced a clean handoff from the reviewed commit.
- [ ] Source code reviewed.
- [ ] Compiled artifact hash is deterministic and reproducible.
- [ ] Test vectors published.
- [ ] Conformance checks pass.
- [ ] External audit completed.
- [ ] Findings resolved or accepted with documented risk.
- [ ] Signed audit manifest committed.
- [ ] `mainnetAllowed: true` set only for audited artifact hashes.
- [ ] `docs/status.md` updated.
- [ ] `SECURITY.md` updated.
- [ ] Release notes updated.
- [ ] Integration guide includes operational caveats.

## Explicit non-goals

Mainnet certification does not prove:

- every verifier is honest;
- every wallet/signer is safe;
- bridges/facilitators cannot fail;
- economic incentives are always sufficient;
- all future code changes remain audited.

Every material change requires a new manifest entry or updated audit evidence.
