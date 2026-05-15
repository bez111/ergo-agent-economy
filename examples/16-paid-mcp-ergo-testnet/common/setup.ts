// ─────────────────────────────────────────────────────────────────────────────
// 16-paid-mcp-ergo-testnet — environment + agent factory
//
// Centralizes the testnet wiring so buyer/, seller/, and scripts/ all build
// the same shape of `ErgoAgentPay`. The required env vars are spelled out
// in README.md; failing fast here avoids the "demo runs, hangs at first
// chain call" experience.
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPay } from "ergo-agent-pay"
import type { SignerFn } from "ergo-agent-pay"
import { loadExampleEnvFile, requiredTestnetEnvNames } from "./env.js"

export interface TestnetConfig {
  buyerAddress: string
  buyerSigner: SignerFn
  sellerAddress: string
  sellerSigner: SignerFn
  reserveBoxId: string
}

/**
 * Read demo configuration from process.env. Throws a friendly error
 * referencing README.md if anything is missing.
 *
 * The signers are intentionally placeholders — example 16 expects you to
 * provide your own EIP-12 / Nautilus / sigma-rust signer wired to a
 * testnet wallet. The script printout in setup-reserve.ts walks through
 * one path; the README walks through three (Nautilus extension,
 * Minotaur CLI, sigma-rust HD wallet).
 */
export function loadTestnetConfigFromEnv(
  opts: { requireReserveBoxId?: boolean } = {},
): TestnetConfig {
  loadExampleEnvFile()

  const requireReserveBoxId = opts.requireReserveBoxId ?? true
  const required = requiredTestnetEnvNames({ requireReserveBoxId })
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      [
        `Missing env: ${missing.join(", ")}`,
        ``,
        `Set these in examples/16-paid-mcp-ergo-testnet/.env, then re-run.`,
        `See examples/16-paid-mcp-ergo-testnet/README.md → "Setup" for`,
        `how to create the buyer wallet, seller wallet, and one-time Reserve.`,
      ].join("\n"),
    )
  }

  // Signer wiring is intentionally not auto-derived from a private key in
  // this scaffold — the demo expects the operator to provide one. See
  // README "Plug in a signer" for three supported paths.
  const placeholderSigner: SignerFn = async () => {
    throw new Error(
      "No signer wired. Edit common/setup.ts and provide your testnet signer. See README.",
    )
  }

  return {
    buyerAddress: process.env.ACCORD_DEMO_BUYER_ADDR!,
    buyerSigner: placeholderSigner,
    sellerAddress: process.env.ACCORD_DEMO_SELLER_ADDR!,
    sellerSigner: placeholderSigner,
    reserveBoxId: process.env.ACCORD_DEMO_RESERVE_BOX_ID ?? "0".repeat(64),
  }
}

export function buildBuyerAgent(cfg: TestnetConfig): ErgoAgentPay {
  return new ErgoAgentPay({
    address: cfg.buyerAddress,
    network: "testnet",
    signer: cfg.buyerSigner,
    policy: {
      // Cap demo spending. Demo Note is 0.001 ERG, this leaves 100x headroom
      // and stops a runaway loop from emptying a hot testnet wallet.
      maxSinglePayment: 100_000_000n,
    },
  })
}

export function buildSellerAgent(cfg: TestnetConfig): ErgoAgentPay {
  return new ErgoAgentPay({
    address: cfg.sellerAddress,
    network: "testnet",
    signer: cfg.sellerSigner,
  })
}
