import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDeadline, validateTaskHash, encodeToHex } from "../predicates.js";
import { ErgoAgentPayError } from "../types.js";

describe("resolveDeadline", () => {
  it("returns absolute height unchanged", () => {
    assert.equal(resolveDeadline(1_300_000, 1_200_000), 1_300_000);
  });

  it('resolves "+100 blocks"', () => {
    assert.equal(resolveDeadline("+100 blocks", 1_200_000), 1_200_100);
  });

  it('resolves "+1 block" (singular)', () => {
    assert.equal(resolveDeadline("+1 block", 500), 501);
  });

  it("resolves with extra spaces", () => {
    assert.equal(resolveDeadline("+50 blocks", 1_000_000), 1_000_050);
  });

  it("throws on invalid format", () => {
    assert.throws(
      // @ts-expect-error — intentionally invalid input
      () => resolveDeadline("100 blocks", 1_000_000),
      (e: unknown) => e instanceof ErgoAgentPayError
    );
  });
});

describe("validateTaskHash", () => {
  it("accepts valid 64-char hex", () => {
    assert.doesNotThrow(() =>
      validateTaskHash("a".repeat(64))
    );
  });

  it("accepts uppercase hex", () => {
    assert.doesNotThrow(() =>
      validateTaskHash("A".repeat(64))
    );
  });

  it("throws on 63-char hex (too short)", () => {
    assert.throws(
      () => validateTaskHash("a".repeat(63)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "INVALID_HASH"
    );
  });

  it("throws on 65-char hex (too long)", () => {
    assert.throws(
      () => validateTaskHash("a".repeat(65)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "INVALID_HASH"
    );
  });

  it("throws on non-hex characters", () => {
    assert.throws(
      () => validateTaskHash("z".repeat(64)),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "INVALID_HASH"
    );
  });
});

describe("encodeToHex", () => {
  it("encodes ASCII string to hex", () => {
    // "hi" = 0x68 0x69
    assert.equal(encodeToHex("hi"), "6869");
  });

  it("encodes empty string to empty hex", () => {
    assert.equal(encodeToHex(""), "");
  });

  it("encodes 'A' correctly", () => {
    assert.equal(encodeToHex("A"), "41");
  });
});
