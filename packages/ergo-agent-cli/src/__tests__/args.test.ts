import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, ArgError, requireString, optionalString, optionalBoolean } from "../args.js";

describe("parseArgs", () => {
  it("parses positional arguments", () => {
    const r = parseArgs(["note", "check", "abc123"]);
    assert.deepEqual(r.positional, ["note", "check", "abc123"]);
    assert.deepEqual(r.flags, {});
  });

  it("parses --flag value pairs", () => {
    const r = parseArgs(["--address", "9X", "--network", "testnet"]);
    assert.equal(r.flags["address"], "9X");
    assert.equal(r.flags["network"], "testnet");
  });

  it("parses --flag=value form", () => {
    const r = parseArgs(["--address=9X"]);
    assert.equal(r.flags["address"], "9X");
  });

  it("treats declared booleans as flags", () => {
    const r = parseArgs(["--json", "balance"], { booleans: ["json"] });
    assert.equal(r.flags["json"], true);
    assert.deepEqual(r.positional, ["balance"]);
  });

  it("supports short aliases for booleans", () => {
    const r = parseArgs(["-h"], { booleans: ["help"], aliases: { h: "help" } });
    assert.equal(r.flags["help"], true);
  });

  it("collects rest after `--`", () => {
    const r = parseArgs(["balance", "--", "--raw", "junk"]);
    assert.deepEqual(r.positional, ["balance"]);
    assert.deepEqual(r.rest, ["--raw", "junk"]);
  });

  it("rejects a value flag with no value", () => {
    assert.throws(
      () => parseArgs(["--address"]),
      (e: unknown) => e instanceof ArgError
    );
  });

  it("rejects unknown short flags", () => {
    assert.throws(
      () => parseArgs(["-x"]),
      (e: unknown) => e instanceof ArgError
    );
  });

  it("interprets --bool=false as false", () => {
    const r = parseArgs(["--json=false"], { booleans: ["json"] });
    assert.equal(r.flags["json"], false);
  });

  it("mixes positional and flags freely", () => {
    const r = parseArgs(["note", "issue", "--recipient", "9Y", "--value", "0.005 ERG"]);
    assert.deepEqual(r.positional, ["note", "issue"]);
    assert.equal(r.flags["recipient"], "9Y");
    assert.equal(r.flags["value"], "0.005 ERG");
  });
});

describe("flag accessors", () => {
  it("requireString throws on missing", () => {
    assert.throws(
      () => requireString({}, "address"),
      (e: unknown) => e instanceof ArgError
    );
  });

  it("requireString returns the value", () => {
    assert.equal(requireString({ address: "9X" }, "address"), "9X");
  });

  it("optionalString returns undefined for absent", () => {
    assert.equal(optionalString({}, "address"), undefined);
  });

  it("optionalBoolean returns false for absent", () => {
    assert.equal(optionalBoolean({}, "json"), false);
  });

  it("optionalBoolean returns true for true", () => {
    assert.equal(optionalBoolean({ json: true }, "json"), true);
  });
});
