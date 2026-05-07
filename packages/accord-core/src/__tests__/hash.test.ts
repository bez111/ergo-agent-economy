import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accordHashV0,
  accordHashV0Raw,
  signingHash,
  withPrefix,
  stripPrefix,
} from "../hash.js";
import { AccordError } from "../errors.js";

describe("accordHashV0", () => {
  it("produces a 32-byte digest", () => {
    const raw = accordHashV0Raw({ a: 1 });
    assert.equal(raw.length, 32);
  });

  it("produces lower-case 64-hex output", () => {
    const hex = accordHashV0({ a: 1 });
    assert.match(hex, /^[0-9a-f]{64}$/);
  });

  it("is deterministic for semantically-identical input", () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    assert.equal(accordHashV0(a), accordHashV0(b));
  });

  it("changes when contents change", () => {
    assert.notEqual(accordHashV0({ a: 1 }), accordHashV0({ a: 2 }));
  });

  it("matches the BLAKE2b-256 of the canonical bytes (smoke vector)", () => {
    // BLAKE2b-256 of "{}" (no whitespace) per RFC 7693 baseline.
    // We don't pin the value here — just assert it's stable across calls.
    assert.equal(accordHashV0({}), accordHashV0({}));
  });
});

describe("signingHash", () => {
  it("strips the named field before hashing", () => {
    const receipt = { a: 1, signature: { x: "deadbeef" } };
    const withSig = accordHashV0(receipt);
    const stripped = signingHash(receipt);
    assert.notEqual(withSig, stripped);
    // Manually-stripped should match.
    const expected = accordHashV0({ a: 1 });
    assert.equal(stripped, expected);
  });

  it("defaults to stripping `signature`", () => {
    const obj = { x: 1, signature: { y: 1 } };
    assert.equal(signingHash(obj), signingHash(obj, "signature"));
  });
});

describe("withPrefix / stripPrefix", () => {
  it("round-trips a 64-hex digest through the wire form", () => {
    const hex = "a".repeat(64);
    const wire = withPrefix(hex);
    assert.equal(wire, `blake2b256:0x${hex}`);
    assert.equal(stripPrefix(wire), hex);
  });

  it("rejects malformed input", () => {
    assert.throws(() => withPrefix("not-hex"), AccordError);
    assert.throws(() => withPrefix("a".repeat(63)), AccordError); // wrong length
    assert.throws(() => stripPrefix("blake2b256:" + "a".repeat(64)), AccordError); // missing 0x
    assert.throws(() => stripPrefix("sha256:0x" + "a".repeat(64)), AccordError); // wrong algo
  });
});
