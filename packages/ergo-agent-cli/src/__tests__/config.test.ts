import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, requireAddress } from "../config.js";
import { parseArgs, ArgError } from "../args.js";

const ENV_KEYS = [
  "ERGO_ADDRESS",
  "ERGO_NETWORK",
  "ERGO_NODE_URL",
  "ERGO_ALLOW_INSECURE_DEV_MODE",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveConfig", () => {
  it("defaults to testnet when nothing is set", () => {
    const c = resolveConfig(parseArgs([]));
    assert.equal(c.network, "testnet");
    assert.equal(c.address, "");
    assert.equal(c.allowInsecureDevMode, false);
  });

  it("honours env vars", () => {
    process.env["ERGO_ADDRESS"] = "9XENV";
    process.env["ERGO_NETWORK"] = "mainnet";
    process.env["ERGO_ALLOW_INSECURE_DEV_MODE"] = "1";
    const c = resolveConfig(parseArgs([]));
    assert.equal(c.address, "9XENV");
    assert.equal(c.network, "mainnet");
    assert.equal(c.allowInsecureDevMode, true);
  });

  it("CLI flag overrides env", () => {
    process.env["ERGO_NETWORK"] = "mainnet";
    const c = resolveConfig(parseArgs(["--network", "testnet"]));
    assert.equal(c.network, "testnet");
  });

  it("rejects an unknown network", () => {
    assert.throws(
      () => resolveConfig(parseArgs(["--network", "bogus"])),
      (e: unknown) => e instanceof ArgError
    );
  });

  it("turns --json into config.json=true", () => {
    const c = resolveConfig(parseArgs(["--json"], { booleans: ["json"] }));
    assert.equal(c.json, true);
  });
});

describe("requireAddress", () => {
  it("returns the address when present", () => {
    const c = resolveConfig(parseArgs(["--address", "9X"]));
    assert.equal(requireAddress(c), "9X");
  });

  it("throws when address is empty", () => {
    const c = resolveConfig(parseArgs([]));
    assert.throws(() => requireAddress(c), (e: unknown) => e instanceof ArgError);
  });
});
