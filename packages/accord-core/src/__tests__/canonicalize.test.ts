import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, stripField } from "../canonicalize.js";
import { AccordError } from "../errors.js";

describe("canonicalize", () => {
  it("encodes primitives", () => {
    assert.equal(canonicalize(null), "null");
    assert.equal(canonicalize(true), "true");
    assert.equal(canonicalize(false), "false");
    assert.equal(canonicalize(0), "0");
    assert.equal(canonicalize(42), "42");
    assert.equal(canonicalize(-7), "-7");
  });

  it("rejects non-integer numbers", () => {
    assert.throws(() => canonicalize(1.5), AccordError);
    assert.throws(() => canonicalize(NaN), AccordError);
    assert.throws(() => canonicalize(Infinity), AccordError);
  });

  it("encodes strings with minimal escapes", () => {
    assert.equal(canonicalize("hello"), '"hello"');
    assert.equal(canonicalize('"quoted"'), '"\\"quoted\\""');
    assert.equal(canonicalize("a\\b"), '"a\\\\b"');
  });

  it("preserves array order", () => {
    assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  });

  it("sorts object keys lexicographically", () => {
    assert.equal(canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}');
    assert.equal(canonicalize({ z: 1, a: { y: 2, b: 1 } }), '{"a":{"b":1,"y":2},"z":1}');
  });

  it("emits no whitespace anywhere", () => {
    const out = canonicalize({ b: 2, a: [1, 2, 3] });
    assert.ok(!/\s/.test(out), `expected no whitespace, got ${JSON.stringify(out)}`);
  });

  it("renders the worked example from docs/canonical-json.md identically every call", () => {
    const example = {
      type: "accord.agreement.v0",
      version: "v0",
      agreement_id: "acc_01HX0000000000000000000000",
      created_at: "2026-05-07T00:00:00Z",
      buyer: { id: "agent://buyer" },
      seller: { id: "provider://repo-audit-agent" },
      task: {
        kind: "repo_audit",
        input_ref: "github:https://github.com/org/repo",
        description: "Audit.",
      },
      price: { amount: "25", currency: "ERG", decimals: 9 },
      payment: {
        mode: "note",
        rail: "ergo",
        reserve_ref: "ergo:box:abc",
        deadline: "+480 blocks",
      },
      verification: {
        required: true,
        method: "verifier_receipt",
        verifier: "verifier://security-v0",
      },
      settlement: {
        mode: "batchable",
        refund_policy: "expiry",
        dispute_policy: "verifier_panel",
      },
    };
    const expected =
      '{"agreement_id":"acc_01HX0000000000000000000000","buyer":{"id":"agent://buyer"},"created_at":"2026-05-07T00:00:00Z","payment":{"deadline":"+480 blocks","mode":"note","rail":"ergo","reserve_ref":"ergo:box:abc"},"price":{"amount":"25","currency":"ERG","decimals":9},"seller":{"id":"provider://repo-audit-agent"},"settlement":{"dispute_policy":"verifier_panel","mode":"batchable","refund_policy":"expiry"},"task":{"description":"Audit.","input_ref":"github:https://github.com/org/repo","kind":"repo_audit"},"type":"accord.agreement.v0","verification":{"method":"verifier_receipt","required":true,"verifier":"verifier://security-v0"},"version":"v0"}';
    assert.equal(canonicalize(example), expected);

    // Determinism: same output across multiple invocations.
    assert.equal(canonicalize(example), canonicalize(example));

    // Order-independence: keys reshuffled, identical canonical bytes.
    const reshuffled = JSON.parse(JSON.stringify(example));
    const keys = Object.keys(reshuffled).reverse();
    const reordered: Record<string, unknown> = {};
    for (const k of keys) reordered[k] = reshuffled[k];
    assert.equal(canonicalize(reordered), expected);
  });
});

describe("stripField", () => {
  it("returns a shallow copy without the named field", () => {
    const obj = { a: 1, signature: { x: 1 } };
    const out = stripField(obj, "signature");
    assert.deepEqual(out, { a: 1 });
    assert.ok(!("signature" in out));
    // original untouched
    assert.deepEqual(obj, { a: 1, signature: { x: 1 } });
  });
});
