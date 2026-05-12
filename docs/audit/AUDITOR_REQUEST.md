# External Auditor Request

We need an independent pre-mainnet review of `accord-protocol/accord-protocol`, focused on compiled ErgoTree bytes and ErgoScript source semantics.

## Scope

Please review the exact commit and audited tree manifest we provide. The primary goal is to certify that each `ergoTreeHex` in `packages/ergo-agent-scripts/data/predicates.json` corresponds to the reviewed source and enforces the intended on-chain semantics.

Trees in scope:

- `task_hash_v0`
- `credential_v0`
- `chaincash_reserve_v0`
- `chaincash_receipt_v0`
- `chaincash_note_v0`
- `basis_reserve_v0`
- `basis_token_reserve_v0`

## Primary questions

1. Can any path drain Reserve collateral outside intended redemption/top-up/mint rules?
2. Can expiry be bypassed or interpreted differently from the spec?
3. Can an attacker replace or mismatch the task hash because of off-chain/on-chain encoding differences?
4. Can a valid task output be copied from the mempool and used to steal redemption?
5. Do ChainCash Reserve/Note/Receipt scripts compose safely in one redemption transaction?
6. Does Basis AVL state prevent double redemption across first and later redemptions?
7. Does the SDK enforce audited tree identity on mainnet, or merely non-empty trees?

## Required deliverable

Please produce a signed report with:

- commit SHA reviewed;
- manifest hash reviewed;
- list of trees reviewed;
- source hash, post-template source hash, ergoTree hash for each tree;
- compiler/interpreter versions used;
- all findings with severity;
- explicit mainnet recommendation: approved, conditionally approved, or rejected.

## Known pre-audit concerns to verify

- `task_hash_v0` is a pure hash predicate and appears front-runnable after `taskOutput` is revealed.
- `chaincash_reserve_v0` source comments contain TODOs for R5 preservation in top-up/mint paths.
- Basis reserve uses `insert` for AVL update with a TODO around `insertOrUpdate`.
- SDK high-level safety checks currently require non-empty `scriptErgoTree` but should also require audited tree identity.
