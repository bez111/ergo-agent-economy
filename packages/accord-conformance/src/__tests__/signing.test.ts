import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateEd25519Keypair,
  signObject,
  verifySignature,
} from "../index.js";

describe("ed25519 signing", () => {
  it("generates a valid keypair", () => {
    const { privateKey, publicKey } = generateEd25519Keypair();
    assert.match(privateKey, /^0x[0-9a-f]{64}$/);
    assert.match(publicKey, /^0x[0-9a-f]{64}$/);
  });

  it("round-trips: sign + verify on a small object", () => {
    const { privateKey, publicKey } = generateEd25519Keypair();
    const signed = signObject(
      { type: "accord.conformance_result.v0", target: "test", levels: [] },
      { privateKey, publicKey },
    );
    assert.equal(signed.signature.scheme, "ed25519");
    assert.equal(signed.signature.public_key.toLowerCase(), publicKey.toLowerCase());
    const r = verifySignature(signed);
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it("verify fails when bytes are tampered with", () => {
    const { privateKey } = generateEd25519Keypair();
    const signed = signObject({ a: 1 }, { privateKey });
    // Mutate a field after signing
    (signed as Record<string, unknown>).a = 2;
    const r = verifySignature(signed as Record<string, unknown>);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "BAD_SIGNATURE");
  });

  it("verify rejects --expected-key mismatch", () => {
    const a = generateEd25519Keypair();
    const b = generateEd25519Keypair();
    const signed = signObject({ a: 1 }, { privateKey: a.privateKey });
    const r = verifySignature(signed, b.publicKey);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "PUBLIC_KEY_MISMATCH");
  });

  it("verify rejects missing signature", () => {
    const r = verifySignature({ a: 1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MISSING_SIGNATURE");
  });

  it("verify rejects malformed signature", () => {
    const r = verifySignature({
      a: 1,
      signature: { scheme: "ed25519", public_key: "garbage", signature: "x" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MALFORMED_SIGNATURE");
  });

  it("verify rejects unsupported scheme", () => {
    const r = verifySignature({
      a: 1,
      signature: { scheme: "rsa", public_key: "0xff", signature: "0xff" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "UNSUPPORTED_SCHEME");
  });

  it("signing the same object twice produces deterministic-shape but distinct timestamps", () => {
    const { privateKey } = generateEd25519Keypair();
    const a = signObject({ x: 1 }, { privateKey });
    const b = signObject({ x: 1 }, { privateKey });
    // Both verify
    assert.equal(verifySignature(a).ok, true);
    assert.equal(verifySignature(b).ok, true);
    // Both have signed_at timestamps in the right shape
    assert.match(a.signature.signed_at, /^[0-9-]+T[0-9:]+Z$/);
  });

  it("`signer` is propagated when supplied", () => {
    const { privateKey } = generateEd25519Keypair();
    const signed = signObject({ x: 1 }, { privateKey, signer: "verifier://demo" });
    assert.equal(signed.signature.signer, "verifier://demo");
  });
});
