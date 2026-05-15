// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — L1 transport-compatibility, MCP-STDIO mode
//
// Spawns an MCP server as a child process and probes its stdio JSON-RPC
// transport. Used by the CLI's `--target stdio:./path/to/server` form.
//
// What it sends (per the Model Context Protocol spec, JSON-RPC 2.0):
//
//   1. `initialize` — handshake, expect protocolVersion + serverInfo
//   2. `tools/list` — expect at least one tool whose inputSchema includes
//      the Accord/MCP fields (`accord_agreement_id`, `accord_payment`)
//   3. `tools/call` with NO accord_agreement_id — expect a structured
//      MCP error result (isError: true) carrying _meta.accord_error_code
//      == MISSING_AGREEMENT_ID
//   4. `tools/call` with accord_agreement_id but no accord_payment —
//      expect _meta.accord_error_code == MISSING_PAYMENT
//
// The protocol-level expectation is identical to the in-process L1: the
// server's wrapAccordMcp behavior (or any conformant equivalent) returns
// AccordMcpResult with isError: true + the right code. Stdio is just the
// transport.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { ConformanceCheck, ConformanceLevelResult } from "./types.js";

export interface RunL1McpStdioOptions {
  /** Path to the MCP-server entrypoint. The conformance suite spawns `node <command>` (or runs the file directly if it's executable). */
  command: string;
  /** Optional argv passed to the spawned process. */
  args?: string[];
  /** Optional env passed to the spawned process. */
  env?: Record<string, string>;
  /** Optional cwd. */
  cwd?: string;
  /** Per-request timeout (ms). Default 5000. */
  timeoutMs?: number;
  /** Tool name to call. Defaults to the first tool with Accord fields. */
  toolName?: string;
}

export async function runL1McpStdio(opts: RunL1McpStdioOptions): Promise<ConformanceLevelResult> {
  const checks: ConformanceCheck[] = [];
  const probe = await McpStdioProbe.spawn(opts);

  try {
    await runHandshake(probe, checks);

    const toolName = await runListTools(probe, checks, opts.toolName);
    if (!toolName) {
      // Can't proceed without a tool to call.
      return summarise(checks);
    }

    await runCallNoAgreementId(probe, toolName, checks);
    await runCallNoPayment(probe, toolName, checks);
  } finally {
    await probe.close();
  }

  return summarise(checks);
}

// ── probes ──────────────────────────────────────────────────────────────────

async function runHandshake(probe: McpStdioProbe, checks: ConformanceCheck[]): Promise<void> {
  const t0 = Date.now();
  try {
    const result = await probe.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "accord-conformance", version: "0.4.1" },
    });
    const ok =
      typeof result === "object" &&
      result !== null &&
      typeof (result as { protocolVersion?: string }).protocolVersion === "string";
    checks.push({
      id: "L1.mcp-stdio.initialize",
      level: "L1",
      description: "MCP server responds to initialize with protocolVersion",
      result: ok ? "pass" : "fail",
      detail: ok ? undefined : `result=${JSON.stringify(result)}`,
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    checks.push({
      id: "L1.mcp-stdio.initialize",
      level: "L1",
      description: "MCP server responds to initialize",
      result: "fail",
      detail: stringifyError(err),
    });
  }
  // Per JSON-RPC, send a notification — but the spec says client MUST send
  // `initialized` after a successful handshake. Many MCP servers tolerate
  // its absence; we send it best-effort.
  try {
    probe.notify("notifications/initialized", {});
  } catch {
    // ignore
  }
}

async function runListTools(
  probe: McpStdioProbe,
  checks: ConformanceCheck[],
  hint?: string,
): Promise<string | undefined> {
  let result: unknown;
  try {
    result = await probe.request("tools/list", {});
  } catch (err) {
    checks.push({
      id: "L1.mcp-stdio.tools-list",
      level: "L1",
      description: "MCP server responds to tools/list",
      result: "fail",
      detail: stringifyError(err),
    });
    return undefined;
  }
  const tools = (result as { tools?: McpToolDef[] }).tools ?? [];
  if (tools.length === 0) {
    checks.push({
      id: "L1.mcp-stdio.tools-list",
      level: "L1",
      description: "tools/list returns at least one tool",
      result: "fail",
      detail: "tools array is empty",
    });
    return undefined;
  }
  // Pick the tool: caller hint, else first one whose inputSchema mentions
  // accord_agreement_id, else the first.
  let target: McpToolDef | undefined =
    (hint && tools.find((t) => t.name === hint)) ||
    tools.find((t) =>
      Boolean(
        t.inputSchema?.properties &&
          Object.keys(t.inputSchema.properties).includes("accord_agreement_id"),
      ),
    );
  if (!target) target = tools[0];
  const ok =
    !!target?.inputSchema?.properties?.accord_agreement_id &&
    !!target?.inputSchema?.properties?.accord_payment;
  checks.push({
    id: "L1.mcp-stdio.tools-list",
    level: "L1",
    description:
      "tools/list returns a tool whose inputSchema declares accord_agreement_id + accord_payment",
    result: ok ? "pass" : "fail",
    detail: ok
      ? undefined
      : `tool '${target?.name}' inputSchema does not include the Accord/MCP fields`,
  });
  return target?.name;
}

async function runCallNoAgreementId(
  probe: McpStdioProbe,
  toolName: string,
  checks: ConformanceCheck[],
): Promise<void> {
  let result: unknown;
  try {
    result = await probe.request("tools/call", { name: toolName, arguments: {} });
  } catch (err) {
    checks.push({
      id: "L1.mcp-stdio.call-missing-agreement-id",
      level: "L1",
      description: "tools/call without accord_agreement_id returns isError result",
      result: "fail",
      detail: `JSON-RPC error: ${stringifyError(err)}`,
    });
    return;
  }
  const code = extractAccordErrorCode(result);
  const ok = code === "MISSING_AGREEMENT_ID";
  checks.push({
    id: "L1.mcp-stdio.call-missing-agreement-id",
    level: "L1",
    description:
      "tools/call without accord_agreement_id → _meta.accord_error_code == MISSING_AGREEMENT_ID",
    result: ok ? "pass" : "fail",
    detail: ok ? undefined : `got code=${code}`,
  });
}

async function runCallNoPayment(
  probe: McpStdioProbe,
  toolName: string,
  checks: ConformanceCheck[],
): Promise<void> {
  let result: unknown;
  try {
    result = await probe.request("tools/call", {
      name: toolName,
      arguments: { accord_agreement_id: "acc_01HX0CONFORMANCEPROBETEST" },
    });
  } catch (err) {
    checks.push({
      id: "L1.mcp-stdio.call-missing-payment",
      level: "L1",
      description: "tools/call with agreement-id but no payment returns isError result",
      result: "fail",
      detail: `JSON-RPC error: ${stringifyError(err)}`,
    });
    return;
  }
  const code = extractAccordErrorCode(result);
  // The provider may either return MISSING_PAYMENT (knows the agreement)
  // or UNKNOWN_AGREEMENT (no agreement store with that id). Both are
  // valid Accord/MCP behaviors.
  const ok = code === "MISSING_PAYMENT" || code === "UNKNOWN_AGREEMENT";
  checks.push({
    id: "L1.mcp-stdio.call-missing-payment",
    level: "L1",
    description:
      "tools/call with agreement-id but no payment → _meta.accord_error_code ∈ {MISSING_PAYMENT, UNKNOWN_AGREEMENT}",
    result: ok ? "pass" : "fail",
    detail: ok ? undefined : `got code=${code}`,
  });
}

// ── stdio JSON-RPC plumbing ──────────────────────────────────────────────────

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

class McpStdioProbe {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: NodeJS.Timeout }
  >();
  private buffer = "";

  static async spawn(opts: RunL1McpStdioOptions): Promise<McpStdioProbe> {
    const cmd = opts.command.startsWith(".") || opts.command.includes("/")
      ? path.resolve(opts.command)
      : opts.command;
    const args = opts.args ?? (cmd.endsWith(".js") || cmd.endsWith(".mjs") ? [cmd] : []);
    const child =
      cmd.endsWith(".js") || cmd.endsWith(".mjs")
        ? spawn("node", [cmd, ...(opts.args ?? [])], {
            env: { ...process.env, ...(opts.env ?? {}) },
            cwd: opts.cwd,
            stdio: ["pipe", "pipe", "pipe"],
          })
        : spawn(cmd, args, {
            env: { ...process.env, ...(opts.env ?? {}) },
            cwd: opts.cwd,
            stdio: ["pipe", "pipe", "pipe"],
          });
    return new McpStdioProbe(child, opts.timeoutMs ?? 5000);
  }

  private dead = false;
  private deathReason: string | undefined;

  constructor(child: ChildProcessWithoutNullStreams, timeoutMs: number) {
    this.child = child;
    this.timeoutMs = timeoutMs;

    this.child.stdout.setEncoding("utf-8");
    this.child.stdout.on("data", (chunk: string) => this.onChunk(chunk));
    this.child.stderr.on("data", () => {
      // Ignore stderr (servers often log there).
    });
    this.child.on("error", (err) => {
      this.dead = true;
      this.deathReason = `spawn error: ${err.message}`;
      this.failAllPending();
    });
    this.child.on("exit", (code, signal) => {
      this.dead = true;
      if (!this.deathReason) {
        this.deathReason = `child exited (code=${code}, signal=${signal})`;
      }
      this.failAllPending();
    });
  }

  private failAllPending(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(this.deathReason ?? "child died"));
    }
    this.pending.clear();
  }

  private onChunk(chunk: string): void {
    this.buffer += chunk;
    // MCP stdio framing: line-delimited JSON.
    let idx = this.buffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) this.handleMessage(line);
      idx = this.buffer.indexOf("\n");
    }
  }

  private handleMessage(line: string): void {
    let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) {
      p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
    } else {
      p.resolve(msg.result);
    }
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.dead) {
      return Promise.reject(new Error(this.deathReason ?? "child is dead"));
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request '${method}' timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  notify(method: string, params: unknown): void {
    if (this.dead) return;
    try {
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    } catch {
      // ignore — child might have died between checks
    }
  }

  async close(): Promise<void> {
    this.failAllPending();
    if (this.dead) return;
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = (): void => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      try {
        this.child.stdin.end();
      } catch {
        // ignore
      }
      this.child.on("close", done);
      this.child.kill();
      // Fallback timer in case the child never closes.
      setTimeout(done, 1500).unref();
    });
  }
}

function extractAccordErrorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as { isError?: boolean; _meta?: Record<string, unknown> };
  if (r.isError !== true) return undefined;
  if (!r._meta || typeof r._meta !== "object") return undefined;
  const code = (r._meta as { accord_error_code?: unknown }).accord_error_code;
  return typeof code === "string" ? code : undefined;
}

function summarise(checks: ConformanceCheck[]): ConformanceLevelResult {
  return {
    level: "L1",
    passed: checks.every((c) => c.result === "pass") && checks.length > 0,
    passed_count: checks.filter((c) => c.result === "pass").length,
    failed_count: checks.filter((c) => c.result === "fail").length,
    inconclusive_count: checks.filter((c) => c.result === "inconclusive").length,
    checks,
  };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
