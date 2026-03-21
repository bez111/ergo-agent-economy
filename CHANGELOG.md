# Changelog

All notable changes to `ergo-agent-pay` are documented here.

---

## [0.2.0] — 2026-03-21

### Added

**Full Note lifecycle** — the SDK now covers the complete Reserve → Note → Tracker pipeline:

- `agent.checkNote(boxId)` — fetch Note from blockchain, decode R4-R7 registers, return `NoteInfo` with `isExpired` flag
- `agent.redeemNote(opts)` — spend a Note, release ERG to receiver; injects context variable 0 for acceptance predicate verification
- `agent.createReserve(config)` — deploy a Reserve collateral box (P2PK for dev, custom ErgoScript for production)
- `agent.deployTracker(config)` — deploy an anti-double-spend Tracker box with empty spent set
- `agent.settleBatch(opts)` — redeem multiple Notes in a single transaction with per-input context variables

**Lifecycle builder functions** (for custom signing flows):
- `buildCreateReserveTx(inputs, height, address, config)`
- `buildRedeemNoteTx(noteBox, feeInputs, height, address, opts)`
- `buildBatchSettleTx(noteBoxes, feeInputs, height, address, opts)`
- `buildDeployTrackerTx(inputs, height, address, config)`

**Register decode helpers:**
- `decodeRegisterInt(hex)` — SInt zigzag decode
- `decodeRegisterBytes(hex)` — SColl[SByte] strip type prefix

**New types** (all exported from package root):
`NoteInfo`, `ReserveConfig`, `ReserveResult`, `RedeemOptions`, `RedeemResult`,
`BatchSettleOptions`, `BatchSettleResult`, `TrackerConfig`, `TrackerResult`

**New error codes:**
`BOX_NOT_FOUND`, `NOTE_EXPIRED`, `NOTE_INVALID`

**New examples:**
- `04-orchestrator-budget` — orchestrator issues budgeted Notes to 3 sub-agents with acceptance predicates
- `05-api-payment-server` — Express server verifies Note on-chain before serving; client demo
- `06-python-agent` — Python/LangChain agent that pays for API calls using Ergo Notes

**Network client:**
- `NetworkClient.getBox(boxId)` — fetch any UTxO by ID

**Documentation:**
- `docs/api-reference.md` — full API reference for all methods, types, error codes

---

## [0.1.0] — 2026-03-18

### Added

Initial release.

- `ErgoAgentPay` class with `pay()` and `issueNote()`
- Policy engine: `maxSinglePayment`, `maxSessionSpend`, `requireApprovalAbove`, `beforePay`/`afterPay` hooks
- LangChain adapter: `asLangChainTool()`
- OpenAI function calling adapter: `asOpenAIFunction()`
- Acceptance predicate helpers: `computeTaskHash()`, `computeTaskHashAsync()`, `validateTaskHash()`
- `resolveDeadline(deadline, currentBlock)` for block-relative expiry
- `parseAmount(amount)` — parse `"N ERG"` strings to nanoERG bigint
- `NetworkClient` — Ergo node API client (height, UTxOs, balance, submit)
- Examples: 01-basic-payment, 02-note-payment, 03-acceptance-predicate
- `docs/primitives.md` — Reserve / Note / Tracker / Acceptance Predicate reference
- `docs/why-ergo.md` — rationale for building on Ergo vs other chains
- `llms.txt` — machine-readable reference for LLM agents
