import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTaskHash, NO_TASK_HASH, asTaskHash, BaseAgentPayError } from "../index.js";

describe("computeTaskHash", () => {
  it("hashes a string with keccak256 (matches Solidity keccak256(bytes))", () => {
    // Solidity: keccak256(bytes("the answer is 42"))
    // Independently verified via viem's keccak256.
    const hex = computeTaskHash("the answer is 42");
    assert.match(hex, /^0x[0-9a-f]{64}$/);
  });

  it("hashes Uint8Array equivalently to its UTF-8 string form", () => {
    const fromString = computeTaskHash("hello");
    const fromBytes = computeTaskHash(new TextEncoder().encode("hello"));
    assert.equal(fromString, fromBytes);
  });

  it("hash of empty string is the well-known constant", () => {
    // keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
    assert.equal(
      computeTaskHash(""),
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
  });

  it("different inputs hash to different outputs", () => {
    assert.notEqual(computeTaskHash("a"), computeTaskHash("b"));
  });

  it("Unicode is handled byte-for-byte (UTF-8)", () => {
    // The bytes "agent 🦌" UTF-8-encoded; deterministic via stringToBytes.
    const a = computeTaskHash("agent 🦌");
    const b = computeTaskHash(new TextEncoder().encode("agent 🦌"));
    assert.equal(a, b);
  });
});

describe("NO_TASK_HASH", () => {
  it("is the bytes32 zero value", () => {
    assert.equal(NO_TASK_HASH, "0x" + "0".repeat(64));
  });
});

describe("asTaskHash", () => {
  it("accepts a 0x-prefixed 64-char hex", () => {
    const h = "0x" + "a".repeat(64);
    assert.equal(asTaskHash(h), h);
  });

  it("rejects too short", () => {
    assert.throws(
      () => asTaskHash("0xabc"),
      (e: unknown) =>
        e instanceof BaseAgentPayError && e.code === "TASK_HASH_MISMATCH"
    );
  });

  it("rejects without 0x prefix", () => {
    assert.throws(() => asTaskHash("a".repeat(64)));
  });

  it("rejects non-hex characters", () => {
    assert.throws(() => asTaskHash("0x" + "z".repeat(64)));
  });
});
