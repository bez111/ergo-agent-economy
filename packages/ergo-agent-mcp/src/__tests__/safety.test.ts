import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ergoCreateReserve,
  ergoIssueNote,
  ergoDeployTracker,
} from "../lifecycle-tools.js";
import type { LifecycleConfig } from "../lifecycle-tools.js";

const baseConfig: LifecycleConfig = {
  address: "9hRjC9Sxc1ASEqp7w4dV8mY1ZGcRGbvTUmPuctYzCwGu7AHWvQ7",
  network: "mainnet",
  nodeUrl: "https://api.ergoplatform.com",
  allowInsecureDevMode: false,
};

// We don't hit the network — assertProductionSafety runs before any I/O,
// so these calls return INSECURE_MAINNET_MODE without ever issuing a request.

describe("MCP lifecycle safety guardrail", () => {
  it("ergo_create_reserve refuses on mainnet without script_ergo_tree", async () => {
    const result = await ergoCreateReserve(baseConfig, { collateral: "1 ERG" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /INSECURE_MAINNET_MODE/);
    assert.match(result.content[0]!.text, /createReserve/);
  });

  it("ergo_issue_note refuses on mainnet without script_ergo_tree", async () => {
    const result = await ergoIssueNote(baseConfig, {
      recipient: "9XReceiver",
      value: "0.005 ERG",
      reserve_box_id: "abc",
      deadline: "+100 blocks",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /INSECURE_MAINNET_MODE/);
    assert.match(result.content[0]!.text, /issueNote/);
  });

  it("ergo_deploy_tracker requires script_ergo_tree", async () => {
    const result = await ergoDeployTracker(baseConfig, {});
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /script_ergo_tree/);
  });
});

describe("MCP lifecycle: required parameters", () => {
  it("ergo_create_reserve rejects missing collateral", async () => {
    const result = await ergoCreateReserve(baseConfig, {});
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /collateral/);
  });

  it("ergo_issue_note rejects both task_hash and task_output", async () => {
    const result = await ergoIssueNote(baseConfig, {
      recipient: "9XReceiver",
      value: "0.005 ERG",
      reserve_box_id: "abc",
      deadline: "+100 blocks",
      task_hash: "a".repeat(64),
      task_output: "the answer",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /not both/);
  });

  it("ergo_issue_note rejects malformed deadline", async () => {
    const result = await ergoIssueNote(baseConfig, {
      recipient: "9XReceiver",
      value: "0.005 ERG",
      reserve_box_id: "abc",
      deadline: "tomorrow",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /deadline/i);
  });
});
