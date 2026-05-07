import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runL1McpStdio } from "../index.js";

const STUB = path.resolve(import.meta.dirname, "fixtures/stub-mcp-server.mjs");

describe("conformance L1 — MCP-stdio probe", () => {
  it("probes a real MCP-stdio server (stub) and reports per-probe checks", async () => {
    const result = await runL1McpStdio({ command: STUB, timeoutMs: 8000 });
    const fails = result.checks.filter((c) => c.result === "fail");
    assert.equal(
      fails.length,
      0,
      `MCP-stdio probe failed:\n${fails
        .map((c) => `  ${c.id}: ${c.detail}`)
        .join("\n")}`,
    );
    assert.ok(result.passed_count >= 4, `expected ≥4 passing checks, got ${result.passed_count}`);
  });

  it("emits a check for every probe step", async () => {
    const result = await runL1McpStdio({ command: STUB, timeoutMs: 8000 });
    const ids = new Set(result.checks.map((c) => c.id));
    for (const id of [
      "L1.mcp-stdio.initialize",
      "L1.mcp-stdio.tools-list",
      "L1.mcp-stdio.call-missing-agreement-id",
      "L1.mcp-stdio.call-missing-payment",
    ]) {
      assert.ok(ids.has(id), `missing check ${id}`);
    }
  });

  it("the missing-payment probe accepts MISSING_PAYMENT or UNKNOWN_AGREEMENT", async () => {
    const result = await runL1McpStdio({ command: STUB, timeoutMs: 8000 });
    const c = result.checks.find((x) => x.id === "L1.mcp-stdio.call-missing-payment");
    assert.equal(c?.result, "pass", c?.detail);
  });

  it("returns 'fail' if the spawned binary is missing", async () => {
    const result = await runL1McpStdio({
      command: "/nonexistent/path/to/server.js",
      timeoutMs: 1000,
    });
    const fails = result.checks.filter((c) => c.result === "fail");
    assert.ok(fails.length >= 1, "expected at least one fail when binary is missing");
  });
});
