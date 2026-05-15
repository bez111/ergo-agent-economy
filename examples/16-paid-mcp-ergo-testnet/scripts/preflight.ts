#!/usr/bin/env tsx
import fs from "node:fs"
import path from "node:path"
import {
  exampleRootDir,
  loadExampleEnvFile,
  requiredTestnetEnvNames,
} from "../common/env.js"

const reserveSetupMode = process.argv.includes("--reserve-setup")
const errors: string[] = []
const warnings: string[] = []

function envValue(name: string): string {
  return process.env[name]?.trim() ?? ""
}

function envFlag(name: string): boolean {
  const value = envValue(name).toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function looksPlaceholder(value: string): boolean {
  return (
    value === "" ||
    value.includes("...") ||
    value.startsWith("<") ||
    /^YOUR_|^REPLACE_/i.test(value)
  )
}

const load = loadExampleEnvFile()
if (!load.found) {
  warnings.push(`No .env file found at ${load.path}; using shell environment only.`)
}

const required = requiredTestnetEnvNames({ requireReserveBoxId: !reserveSetupMode })
for (const name of required) {
  const value = envValue(name)
  if (!value) errors.push(`Missing ${name}`)
  if (looksPlaceholder(value)) errors.push(`${name} still looks like a placeholder`)
}

const buyer = envValue("ACCORD_DEMO_BUYER_ADDR")
const seller = envValue("ACCORD_DEMO_SELLER_ADDR")
const reserveBoxId = envValue("ACCORD_DEMO_RESERVE_BOX_ID")

if (buyer && seller && buyer === seller) {
  errors.push("Buyer and seller addresses must be different testnet wallets")
}

if (!reserveSetupMode && reserveBoxId && !/^[0-9a-f]{64}$/i.test(reserveBoxId)) {
  errors.push("ACCORD_DEMO_RESERVE_BOX_ID must be a 64-character hex box id")
}

for (const name of [
  "ERGO_ALLOW_INSECURE_DEV_MODE",
  "DANGEROUSLY_ALLOW_INSECURE_MAINNET_P2PK",
  "DANGEROUSLY_ALLOW_UNAUDITED_ERGOTREE",
]) {
  if (envFlag(name)) errors.push(`${name} must not be enabled for the testnet pilot`)
}

for (const name of ["ERGO_NETWORK", "ACCORD_DEMO_NETWORK"]) {
  if (envValue(name).toLowerCase() === "mainnet") {
    errors.push(`${name}=mainnet is not allowed for example 16`)
  }
}

const setupSource = fs.readFileSync(path.join(exampleRootDir(), "common/setup.ts"), "utf8")
if (setupSource.includes("No signer wired")) {
  errors.push("common/setup.ts still has the placeholder signer; wire a testnet signer before running on-chain")
}

if (warnings.length) {
  console.log("Ergo testnet preflight warnings:")
  for (const warning of warnings) console.log(`- ${warning}`)
  console.log("")
}

if (errors.length) {
  console.error("Ergo testnet preflight failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  reserveSetupMode
    ? "Ergo testnet reserve-setup preflight passed."
    : "Ergo testnet demo preflight passed.",
)
