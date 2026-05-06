// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-mcp — Lifecycle tool handlers
//
// These tools delegate to ergo-agent-pay's high-level SDK class so they
// inherit the assertProductionSafety guardrail and the BLAKE2b-256 hash
// function from a single source of truth. Each handler builds an unsigned
// EIP-12 transaction and returns it as JSON for the host to sign.
// ─────────────────────────────────────────────────────────────────────────────

import { ErgoAgentPay, computeTaskHash, ErgoAgentPayError } from "ergo-agent-pay";
import type { Network } from "ergo-agent-pay";

export interface LifecycleConfig {
  address: string;
  network: Network;
  nodeUrl: string;
  allowInsecureDevMode: boolean;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const err = (text: string, code?: string): ToolResult => ({
  content: [{ type: "text", text: code ? `Error [${code}]: ${text}` : `Error: ${text}` }],
  isError: true,
});

function newAgent(config: LifecycleConfig): ErgoAgentPay {
  if (!config.address) {
    throw new ErgoAgentPayError(
      "No agent address configured. Pass --address when starting the server.",
      "INVALID_ADDRESS"
    );
  }
  return new ErgoAgentPay({
    address: config.address,
    network: config.network,
    nodeUrl: config.nodeUrl,
    allowInsecureDevMode: config.allowInsecureDevMode,
  });
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`'${name}' is required and must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseDeadline(raw: string): number | `+${number} blocks` | `+${number} block` {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const match = raw.match(/^\+(\d+)\s*blocks?$/i);
  if (!match) {
    throw new Error(
      `Invalid deadline "${raw}". Use an absolute block height or "+N blocks".`
    );
  }
  return raw as `+${number} blocks` | `+${number} block`;
}

function reportError(e: unknown): ToolResult {
  if (e instanceof ErgoAgentPayError) return err(e.message, e.code);
  if (e instanceof Error) return err(e.message);
  return err(String(e));
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export async function ergoTaskHash(params: Record<string, unknown>): Promise<ToolResult> {
  try {
    // Distinguish "not provided" from "explicitly empty" — the empty-string
    // vector is a valid input, so we check `in` rather than truthiness.
    const hasText = "text" in params && typeof params["text"] === "string";
    const hasHex = "hex" in params && typeof params["hex"] === "string";

    if ((!hasText && !hasHex) || (hasText && hasHex)) {
      return err("ergo_task_hash needs exactly one of: 'text' or 'hex'.");
    }

    let bytes: Uint8Array;
    if (hasHex) {
      const hex = params["hex"] as string;
      if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        return err(`'hex' must be an even-length hex string (got "${hex}").`);
      }
      bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
    } else {
      bytes = new TextEncoder().encode(params["text"] as string);
    }

    const digest = computeTaskHash(bytes);
    return ok(
      `BLAKE2b-256 task hash:\n  ${digest}\n\n` +
        `Algorithm: BLAKE2b-256 (32-byte output, ErgoScript-compatible)\n` +
        `Input bytes: ${bytes.length}`
    );
  } catch (e) {
    return reportError(e);
  }
}

export async function ergoCreateReserve(
  config: LifecycleConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const collateral = asString(params["collateral"], "collateral");
    const scriptErgoTree = optionalString(params["script_ergo_tree"]);
    const memo = optionalString(params["memo"]);

    const agent = newAgent(config);
    const result = await agent.createReserve({ collateral, scriptErgoTree, memo });

    return ok(
      `Unsigned EIP-12 reserve creation transaction built.\n` +
        `  Network:     ${config.network}\n` +
        `  Collateral:  ${result.reserve.value} nanoERG\n` +
        `  Has script:  ${result.reserve.hasScript}\n` +
        `  Memo:        ${memo ?? "(none)"}\n\n` +
        `Sign and submit with ergo_submit_transaction.\n\n` +
        `<unsigned_tx>\n${JSON.stringify(result.unsignedTx, null, 2)}\n</unsigned_tx>`
    );
  } catch (e) {
    return reportError(e);
  }
}

export async function ergoIssueNote(
  config: LifecycleConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const recipient = asString(params["recipient"], "recipient");
    const value = asString(params["value"], "value");
    const reserveBoxId = asString(params["reserve_box_id"], "reserve_box_id");
    const deadline = parseDeadline(asString(params["deadline"], "deadline"));

    let taskHash = optionalString(params["task_hash"]);
    const taskOutput = optionalString(params["task_output"]);
    if (taskHash !== undefined && taskOutput !== undefined) {
      return err("Pass either 'task_hash' or 'task_output', not both.");
    }
    if (taskOutput !== undefined) {
      taskHash = computeTaskHash(taskOutput);
    }

    const credentialKey = optionalString(params["credential_key"]);
    const scriptErgoTree = optionalString(params["script_ergo_tree"]);

    const agent = newAgent(config);
    const result = await agent.issueNote({
      recipient,
      value,
      reserveBoxId,
      deadline,
      taskHash,
      credentialKey,
      scriptErgoTree,
    });

    return ok(
      `Unsigned EIP-12 note issuance transaction built.\n` +
        `  Network:     ${config.network}\n` +
        `  Recipient:   ${recipient}\n` +
        `  Value:       ${result.noteOutput.value} nanoERG\n` +
        `  Reserve:     ${result.noteOutput.reserveBoxId}\n` +
        `  Expires:     block ${result.noteOutput.expiryBlock}\n` +
        `  Task hash:   ${result.noteOutput.taskHash ?? "(none)"}\n` +
        `  Has script:  ${scriptErgoTree ? "yes" : "no — dev mode"}\n\n` +
        `Sign and submit with ergo_submit_transaction.\n\n` +
        `<unsigned_tx>\n${JSON.stringify(result.unsignedTx, null, 2)}\n</unsigned_tx>`
    );
  } catch (e) {
    return reportError(e);
  }
}

export async function ergoRedeemNote(
  config: LifecycleConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const noteBoxId = asString(params["note_box_id"], "note_box_id");
    const taskOutput = optionalString(params["task_output"]);
    const receiverAddress = optionalString(params["receiver_address"]);

    const agent = newAgent(config);
    const result = await agent.redeemNote({ noteBoxId, taskOutput, receiverAddress });

    return ok(
      `Unsigned EIP-12 note redemption transaction built.\n` +
        `  Note:      ${result.redeemed.noteBoxId}\n` +
        `  Value:     ${result.redeemed.value} nanoERG\n` +
        `  Receiver:  ${result.redeemed.receiver}\n\n` +
        `Sign and submit with ergo_submit_transaction.\n\n` +
        `<unsigned_tx>\n${JSON.stringify(result.unsignedTx, null, 2)}\n</unsigned_tx>`
    );
  } catch (e) {
    return reportError(e);
  }
}

export async function ergoDeployTracker(
  config: LifecycleConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const scriptErgoTree = asString(params["script_ergo_tree"], "script_ergo_tree");

    const agent = newAgent(config);
    const result = await agent.deployTracker({ scriptErgoTree });

    return ok(
      `Unsigned EIP-12 tracker deployment transaction built.\n` +
        `  Network:     ${config.network}\n` +
        `  Has script:  ${result.tracker.hasScript}\n\n` +
        `Sign and submit with ergo_submit_transaction.\n\n` +
        `<unsigned_tx>\n${JSON.stringify(result.unsignedTx, null, 2)}\n</unsigned_tx>`
    );
  } catch (e) {
    return reportError(e);
  }
}

export async function ergoSettleBatch(
  config: LifecycleConfig,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const boxesRaw = params["note_box_ids"];
    let noteBoxIds: string[];
    if (Array.isArray(boxesRaw)) {
      noteBoxIds = boxesRaw.filter((s): s is string => typeof s === "string" && s.length > 0);
    } else if (typeof boxesRaw === "string") {
      noteBoxIds = boxesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      return err("'note_box_ids' is required (array of strings or comma-separated string).");
    }
    if (noteBoxIds.length === 0) {
      return err("'note_box_ids' must not be empty.");
    }

    const taskOutputsRaw = params["task_outputs"];
    let taskOutputs: Record<string, string> | undefined;
    if (
      taskOutputsRaw &&
      typeof taskOutputsRaw === "object" &&
      !Array.isArray(taskOutputsRaw)
    ) {
      taskOutputs = {};
      for (const [k, v] of Object.entries(taskOutputsRaw)) {
        if (typeof v === "string") taskOutputs[k] = v;
      }
    }

    const receiverAddress = optionalString(params["receiver_address"]);

    const agent = newAgent(config);
    const result = await agent.settleBatch({
      noteBoxIds,
      taskOutputs,
      receiverAddress,
    });

    return ok(
      `Unsigned EIP-12 batch settlement transaction built.\n` +
        `  Notes:       ${result.settlement.noteCount}\n` +
        `  Total value: ${result.settlement.totalValue} nanoERG\n` +
        `  Receiver:    ${result.settlement.receiver}\n\n` +
        `Sign and submit with ergo_submit_transaction.\n\n` +
        `<unsigned_tx>\n${JSON.stringify(result.unsignedTx, null, 2)}\n</unsigned_tx>`
    );
  } catch (e) {
    return reportError(e);
  }
}
