import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNanoErgs } from "../output.js";

describe("formatNanoErgs", () => {
  it("formats whole ERG", () => {
    assert.equal(formatNanoErgs(1_000_000_000n), "1 ERG");
  });

  it("formats fractional ERG", () => {
    assert.equal(formatNanoErgs(5_000_000n), "0.005 ERG");
  });

  it("formats sub-nano", () => {
    assert.equal(formatNanoErgs(1n), "0.000000001 ERG");
  });

  it("strips trailing zeros", () => {
    assert.equal(formatNanoErgs(1_500_000_000n), "1.5 ERG");
  });

  it("formats zero", () => {
    assert.equal(formatNanoErgs(0n), "0 ERG");
  });

  it("formats negatives", () => {
    assert.equal(formatNanoErgs(-1_500_000_000n), "-1.5 ERG");
  });
});
