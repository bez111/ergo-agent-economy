import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertProductionSafety } from "../safety.js";
import { ErgoAgentPayError } from "../types.js";

describe("assertProductionSafety", () => {
  it("allows testnet without a script", () => {
    assert.doesNotThrow(() =>
      assertProductionSafety({
        operation: "createReserve",
        network: "testnet",
        scriptErgoTree: undefined,
        allowInsecureDevMode: false,
      })
    );
  });

  it("allows mainnet when scriptErgoTree is set", () => {
    assert.doesNotThrow(() =>
      assertProductionSafety({
        operation: "issueNote",
        network: "mainnet",
        scriptErgoTree: "100204a00b08cd...",
        allowInsecureDevMode: false,
      })
    );
  });

  it("allows mainnet when allowInsecureDevMode is true (explicit opt-in)", () => {
    assert.doesNotThrow(() =>
      assertProductionSafety({
        operation: "createReserve",
        network: "mainnet",
        scriptErgoTree: undefined,
        allowInsecureDevMode: true,
      })
    );
  });

  it("rejects mainnet without script and without opt-in (createReserve)", () => {
    assert.throws(
      () =>
        assertProductionSafety({
          operation: "createReserve",
          network: "mainnet",
          scriptErgoTree: undefined,
          allowInsecureDevMode: false,
        }),
      (e: unknown) =>
        e instanceof ErgoAgentPayError && e.code === "INSECURE_MAINNET_MODE"
    );
  });

  it("rejects mainnet without script and without opt-in (issueNote)", () => {
    assert.throws(
      () =>
        assertProductionSafety({
          operation: "issueNote",
          network: "mainnet",
          scriptErgoTree: undefined,
          allowInsecureDevMode: undefined,
        }),
      (e: unknown) =>
        e instanceof ErgoAgentPayError && e.code === "INSECURE_MAINNET_MODE"
    );
  });

  it("treats empty-string scriptErgoTree as missing", () => {
    assert.throws(
      () =>
        assertProductionSafety({
          operation: "deployTracker",
          network: "mainnet",
          scriptErgoTree: "",
          allowInsecureDevMode: false,
        }),
      (e: unknown) =>
        e instanceof ErgoAgentPayError && e.code === "INSECURE_MAINNET_MODE"
    );
  });

  it("error message names the operation", () => {
    try {
      assertProductionSafety({
        operation: "issueNote",
        network: "mainnet",
        scriptErgoTree: undefined,
        allowInsecureDevMode: false,
      });
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof ErgoAgentPayError);
      assert.match(err.message, /issueNote/);
      assert.match(err.message, /allowInsecureDevMode/);
    }
  });
});
