import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeRegisterInt, decodeRegisterBytes } from "../lifecycle.js";

describe("decodeRegisterInt", () => {
  it("returns 0 for empty string", () => {
    assert.equal(decodeRegisterInt(""), 0);
  });

  it("returns 0 for short string", () => {
    assert.equal(decodeRegisterInt("04"), 0);
  });

  it("decodes positive integer — zigzag(2) = 0x04 → 2", () => {
    // zigzag encode: n=2 → (2<<1)^0 = 4 = 0x04
    // SInt hex: "04" prefix + "04" value = "0404"
    assert.equal(decodeRegisterInt("0404"), 2);
  });

  it("decodes SInt(1) — zigzag(1)=0x02 → '0402'", () => {
    assert.equal(decodeRegisterInt("0402"), 1);
  });

  it("decodes SInt(-1) — zigzag(-1)=0x01 → '0401'", () => {
    assert.equal(decodeRegisterInt("0401"), -1);
  });

  it("decodes SInt(0) — zigzag(0)=0x00 → '0400'", () => {
    assert.equal(decodeRegisterInt("0400"), 0);
  });
});

describe("decodeRegisterBytes", () => {
  it("returns empty string for empty input", () => {
    assert.equal(decodeRegisterBytes(""), "");
  });

  it("strips 0e + length prefix (4 hex chars)", () => {
    // "0e 03 aabbcc" → "aabbcc"
    assert.equal(decodeRegisterBytes("0e03aabbcc"), "aabbcc");
  });

  it("strips prefix from 32-byte task hash encoding", () => {
    const taskHashHex = "a".repeat(64); // 32 bytes
    const encoded = `0e20${taskHashHex}`; // 0e = type, 20 = 32 in hex
    assert.equal(decodeRegisterBytes(encoded), taskHashHex);
  });

  it("returns empty for only 4-char input (type + length, no content)", () => {
    assert.equal(decodeRegisterBytes("0e00"), "");
  });
});
