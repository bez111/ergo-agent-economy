# Launch artifacts

This directory holds drafts for the public launch of `ergo-agent-economy`
v0.3.0. The intended audience is AI-agent developers (LangChain, CrewAI,
AutoGen, MCP), not the existing Ergo community — we already have that
audience via the ChainCash repo.

* `hn-launch.md` — Show HN draft.
* `x-thread.md` — X (Twitter) launch thread.
* `discord-announcement.md` — Discord post for relevant servers.
* `mcp-so-listing.md` — copy for the [mcp.so](https://mcp.so) listing.
* `og-image-spec.md` — what an OG image (open graph preview) should
  look like, with a placeholder URL until we have one.

Each draft is short, factual, and links back to the canonical artefacts
in the repo (SPEC, SECURITY, audit pack). None of them claim mainnet
readiness; everything points at the testnet-first story.

## Order of operations for the launch

1. Tag `v0.3.0` and verify both registries pick it up.
2. Get one external auditor commitment (even informal). Without that,
   the "NOT CERTIFIED FOR MAINNET" banner stays loud.
3. Submit `mcp.json` to the mcp.so listing.
4. Post Show HN. Capture the discussion in `hn-launch.md` afterwards
   for the next iteration.
5. X thread within 24h of HN post.
6. Discord posts in agent-dev communities (one per community, no
   cross-posting).
7. Reach out to 3-5 design partners in private — agent teams that
   already need a payment rail.

The first 48 hours determine whether discovery happens at all.

## Don't post until

* Both `npm view ergo-agent-pay version` and `pip show ergo-agent-pay`
  return `0.3.0`.
* The end-to-end demo in `examples/07-end-to-end-agent-economy/` runs
  on testnet from a clean clone.
* The CHANGELOG entry is finalised and the GitHub Release is published.
