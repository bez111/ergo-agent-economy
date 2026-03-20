# Contributing

PRs welcome. This repo is the open source hub for autonomous agent payment systems on Ergo.

## What we want

### More examples
- Python examples (using ergo-lib-python or REST API directly)
- Rust examples (using sigma-rust)
- Multi-agent orchestration patterns
- ChainCash integration examples
- Production deployment patterns (server-side key management)

### Better docs
- Worked examples with actual testnet transaction IDs
- Performance benchmarks (TPS, latency, cost per tx)
- Comparison with other chains — data-backed, not opinion

### Real-world patterns
- "Agent pays for API call" — end to end with a real API
- "Orchestrator issues budget to sub-agents" — multi-agent pipeline
- "Batch settlement" — accumulate Notes, redeem once

## How to contribute

1. Fork the repo
2. Create a branch: `git checkout -b your-feature`
3. Add your example/fix
4. Make sure it runs: `node index.js` should produce output without errors
5. PR with a clear description of what it demonstrates

## Code standards

- ESM modules (`type: module` in package.json)
- No transpilation — Node.js 18+ native features only
- Minimal dependencies — `@fleet-sdk/core` and Node.js stdlib only
- Every example must work on Ergo testnet with real API calls
- Comments explaining the agent payment concept, not just the code

## Questions

Open an issue. Or read the full technical reference at:
https://ergoblockchain.org/build/agent-payments
