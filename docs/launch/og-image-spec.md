# Open Graph image — spec

When social platforms (X, LinkedIn, Bluesky, Discord embeds) preview a
GitHub link, they request the repo's social preview image. Ours is
currently the default GitHub-generated one. A custom image can lift
preview-CTR significantly.

## What to render

Aspect ratio: **1280 × 640** (GitHub's recommended social preview size).

Recommended composition:

* Top-left: small Ergo logo or the four-primitives diagram (a tiny
  clean version of the Reserve / Note / Tracker / Acceptance Predicate
  rectangles from the README).
* Centre / large: project name set in a clean monospace, with the
  tagline below in a softer typeface.
  ```
  ergo-agent-economy
  Autonomous agents pay each other on-chain.
  ```
* Bottom-right or bottom-left: a code fragment that is recognisably
  this project's API (so devs scrolling can identify the surface
  immediately):
  ```ts
  await agent.issueNote({
    recipient: subAgent,
    value: "0.005 ERG",
    deadline: "+100 blocks",
    taskHash: blake2b256(expectedOutput),
  })
  ```
* No corporate gradients. No stock illustrations. No cyberpunk neon.
  Black background, off-white type, single accent colour from Ergo's
  palette.

## How to upload

1. Render the image (Figma / Sketch / hand-coded SVG → PNG).
2. Settings → Social preview → "Edit" → upload PNG.
3. Verify the embed at https://www.opengraph.xyz/url/https%3A%2F%2Fgithub.com%2Faccord-protocol%2Faccord-protocol

## Placeholder until ready

Until we have a real OG image, the GitHub default is fine — it shows
the repo name, owner, primary language, and stars. Not pretty, not
broken. Resist the urge to ship a half-baked hand-drawn image.

## Logo (separate, smaller scope)

A logo for the repo / npm packages is a separate task. For now the
README and npm pages use no logo. Adding one means:

* Designing or commissioning a 512×512 mark.
* Committing it to `assets/logo.svg`.
* Linking from each package's README and from the docs site.
* Updating the OG image with the same mark.

This is a "do once, do right" task. Don't ship a placeholder mark.
