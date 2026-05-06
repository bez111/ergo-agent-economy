import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { main } from "../index.js";

async function captureExit(fn: () => Promise<number>): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    return true;
  }) as typeof process.stderr.write;
  let code = 0;
  try {
    code = await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, stdout, stderr };
}

describe("CLI dispatcher", () => {
  it("--help prints usage and exits 0", async () => {
    const r = await captureExit(() => main(["--help"]));
    assert.equal(r.code, 0);
    assert.match(r.stdout, /USAGE/);
    assert.match(r.stdout, /task-hash/);
  });

  it("--version prints the version and exits 0", async () => {
    const r = await captureExit(() => main(["--version"]));
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^ergo-agent \d+\.\d+\.\d+/);
  });

  it("no args prints help and exits 0", async () => {
    const r = await captureExit(() => main([]));
    assert.equal(r.code, 0);
    assert.match(r.stdout, /USAGE/);
  });

  it("unknown command exits 2", async () => {
    const r = await captureExit(() => main(["nope"]));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown command/);
  });

  it("missing required flag for note issue exits 2", async () => {
    const r = await captureExit(() =>
      main(["--address", "9X", "note", "issue", "--recipient", "9Y"])
    );
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Missing required flag/);
  });

  it("note check without boxId exits 2", async () => {
    const r = await captureExit(() => main(["note", "check"]));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /note check/);
  });

  it("invalid network argument exits 2", async () => {
    const r = await captureExit(() => main(["--network", "bogus", "balance"]));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /network/);
  });
});
