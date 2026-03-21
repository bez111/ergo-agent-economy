import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ErgoAgentPayError } from "../types.js";

describe("ErgoAgentPayError", () => {
  it("has correct name", () => {
    const e = new ErgoAgentPayError("test", "INVALID_AMOUNT");
    assert.equal(e.name, "ErgoAgentPayError");
  });

  it("has correct code", () => {
    const e = new ErgoAgentPayError("test", "INSUFFICIENT_FUNDS");
    assert.equal(e.code, "INSUFFICIENT_FUNDS");
  });

  it("is instance of Error", () => {
    const e = new ErgoAgentPayError("test", "NETWORK_ERROR");
    assert.ok(e instanceof Error);
  });

  it("stores cause", () => {
    const cause = new Error("root cause");
    const e = new ErgoAgentPayError("wrapped", "SUBMISSION_FAILED", cause);
    assert.equal(e.cause, cause);
  });

  it("works with instanceof check in catch block", () => {
    let caught: unknown;
    try {
      throw new ErgoAgentPayError("oops", "POLICY_REJECTED");
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof ErgoAgentPayError);
    assert.ok(caught instanceof Error);
  });
});
