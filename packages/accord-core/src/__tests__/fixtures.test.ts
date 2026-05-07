import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonicalize, accordHashV0 } from "../index.js";

// Repo-root-relative path. Workspaces resolve from the package dir, so we
// climb two levels to reach the monorepo root.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const VECTOR_ROOT = path.join(REPO_ROOT, "test-vectors");

interface Fixture {
  family: string;
  name: string;
  jsonPath: string;
  canonicalPath: string;
  hashPath: string;
}

function discover(): Fixture[] {
  const families = ["agreement/v0", "verification-receipt/v0", "settlement-receipt/v0"];
  const out: Fixture[] = [];
  for (const family of families) {
    const dir = path.join(VECTOR_ROOT, family);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      if (f.startsWith("invalid-")) continue;
      const name = f.replace(/\.json$/, "");
      const jsonPath = path.join(dir, f);
      const canonicalPath = path.join(dir, `${name}.canonical.txt`);
      const hashPath = path.join(dir, `${name}.hash.txt`);
      out.push({ family, name, jsonPath, canonicalPath, hashPath });
    }
  }
  return out;
}

describe("test-vector fixtures (cross-language reference)", () => {
  const fixtures = discover();

  it("found at least one fixture per family", () => {
    const families = new Set(fixtures.map((f) => f.family));
    assert.ok(families.has("agreement/v0"), "missing agreement/v0 fixtures");
    assert.ok(families.has("verification-receipt/v0"), "missing verification-receipt/v0 fixtures");
    assert.ok(families.has("settlement-receipt/v0"), "missing settlement-receipt/v0 fixtures");
  });

  for (const fx of fixtures) {
    describe(`${fx.family}/${fx.name}`, () => {
      const data = JSON.parse(fs.readFileSync(fx.jsonPath, "utf-8"));
      delete data._comment;

      it("has a pinned canonical-bytes file", () => {
        assert.ok(
          fs.existsSync(fx.canonicalPath),
          `missing ${fx.canonicalPath}; run scripts/derive-fixture-hashes.mjs to regenerate`,
        );
      });

      it("has a pinned hash file", () => {
        assert.ok(
          fs.existsSync(fx.hashPath),
          `missing ${fx.hashPath}; run scripts/derive-fixture-hashes.mjs to regenerate`,
        );
      });

      it("canonicalize() reproduces the pinned canonical bytes", () => {
        const expected = fs.readFileSync(fx.canonicalPath, "utf-8").replace(/\n$/, "");
        const got = canonicalize(data);
        assert.equal(got, expected);
      });

      it("accordHashV0() reproduces the pinned hash", () => {
        const expected = fs.readFileSync(fx.hashPath, "utf-8").replace(/\n$/, "");
        const got = accordHashV0(data);
        assert.equal(got, expected);
        assert.match(got, /^[0-9a-f]{64}$/);
      });
    });
  }
});
