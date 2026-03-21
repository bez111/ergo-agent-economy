import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAmount } from "../transactions.js";
import { ErgoAgentPayError } from "../types.js";

describe("parseAmount", () => {
  it("returns bigint as-is", () => {
    assert.equal(parseAmount(5_000_000n), 5_000_000n);
  });

  it("parses integer nanoERG string", () => {
    assert.equal(parseAmount("1000000"), 1_000_000n);
  });

  it("parses integer number", () => {
    assert.equal(parseAmount(1000000), 1_000_000n);
  });

  it('parses "0.001 ERG"', () => {
    assert.equal(parseAmount("0.001 ERG"), 1_000_000n);
  });

  it('parses "1 ERG"', () => {
    assert.equal(parseAmount("1 ERG"), 1_000_000_000n);
  });

  it('parses "1.5 ERG"', () => {
    assert.equal(parseAmount("1.5 ERG"), 1_500_000_000n);
  });

  it('parses "0.000000001 ERG" (1 nanoERG)', () => {
    assert.equal(parseAmount("0.000000001 ERG"), 1n);
  });

  it("is case-insensitive for ERG suffix", () => {
    assert.equal(parseAmount("0.001 erg"), 1_000_000n);
    assert.equal(parseAmount("0.001 Erg"), 1_000_000n);
  });

  it("throws INVALID_AMOUNT for non-numeric string", () => {
    assert.throws(
      () => parseAmount("not a number"),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "INVALID_AMOUNT"
    );
  });

  it("throws INVALID_AMOUNT for empty string", () => {
    assert.throws(
      () => parseAmount(""),
      (e: unknown) => e instanceof ErgoAgentPayError && e.code === "INVALID_AMOUNT"
    );
  });
});
