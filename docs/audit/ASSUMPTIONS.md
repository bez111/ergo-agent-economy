# Audit Assumptions

This document defines the trust assumptions an external audit should review or explicitly exclude. Accord can bind agreements, verification receipts, and settlement receipts, but it does not make every surrounding actor honest or every integration safe.

## Verifier Assumptions

- A verifier may be wrong, unavailable, compromised, or biased.
- Accord receipts prove what a verifier attested, not that the verifier's real-world judgment is correct.
- Implementations must bind verifier identity, method, evidence requirements, and result semantics into the Agreement and Verification Receipt.
- Production buyers should use allow-lists, quorum rules, reputation, or human approval for high-value work.

Audit focus:

- replay resistance of verification receipts;
- mismatched agreement/verifier identity handling;
- whether examples imply stronger verifier guarantees than the code provides;
- failure behavior when verification is required but unavailable.

## Wallet And Signer Assumptions

- Wallets and signing services are outside Accord's trust boundary.
- A compromised signer can authorize payments or settlements that Accord will treat as user-authorized.
- Mainnet signing must not rely on unaudited P2PK or arbitrary contract/tree paths unless an explicit dangerous override is used.
- Key custody, hardware wallets, multisig, rate limits, and approvals are deployment responsibilities.

Audit focus:

- default-deny behavior for mainnet writes;
- clarity and noisiness of all `dangerously*` flags;
- absence of dangerous flags from examples;
- whether wallet errors can bypass safety gates.

## Bridge Assumptions

- Rosen and other bridges are independent systems with their own watcher, liquidity, finality, and operational risks.
- Accord rail adapters can verify wrapped-token shape and settlement receipts, but they do not prove the source-chain bridge process was safe.
- Bridge downtime, delayed finality, liquidity exhaustion, or wrapped-token depegs remain integration risks.

Audit focus:

- whether Rosen adapters clearly separate Ergo-side Note verification from bridge custody guarantees;
- token-id and decimal handling;
- whether docs imply bridge security is certified by Accord.

## Facilitator Assumptions

- x402-compatible facilitators and payment processors are outside Accord's custody boundary.
- Accord can bind payment proof and work completion, but facilitator policy, settlement finality, chargeback behavior, and uptime remain facilitator risks.
- HTTP challenge and receipt flows must avoid replay, stale challenge reuse, and mismatched agreement ids.

Audit focus:

- Accord/402 challenge replay resistance;
- agreement id and payment id binding;
- response metadata integrity;
- failure behavior when facilitator proof is missing, stale, or malformed.

## Registry Assumptions

- Registry entries describe providers, rails, verifiers, manifests, and revocations, but the registry is not itself an audit signature.
- The authoritative mainnet gate remains the per-rail signed manifest plus runtime safety checks.
- Consumers should pin package versions and trusted auditor keys.

Audit focus:

- registry schema validation;
- manifest path resolution;
- stale or revoked entry handling;
- whether docs describe registry entries as descriptive, not authoritative.

## Non-Goals

The audit should not treat any of the following as proof of mainnet safety:

- passing unit tests;
- passing conformance tests;
- successful testnet pilots;
- README claims;
- maintainer signatures without an independent external auditor;
- ChainCash/Basis reference status.

The audit may still review those materials as supporting evidence, but `mainnetAllowed: true` requires signed external audit evidence for the exact artifact hash.
