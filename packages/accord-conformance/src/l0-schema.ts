// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/conformance — L0 schema-compatibility checks
//
// Loads every fixture under `test-vectors/{agreement,verification-receipt,
// settlement-receipt}/v0/` and runs three checks per fixture:
//
//   1. JSON Schema validation against the matching `schemas/<kind>.v0.schema.json`
//   2. Canonical-bytes equality against the pinned `<name>.canonical.txt`
//   3. accord_hash_v0 equality against the pinned `<name>.hash.txt`
//
// Reject fixtures (filename starts with `invalid-`) run check #1 with the
// expectation that schema validation fails.
//
// L0 is the foundation — every other level assumes objects validate. A
// third-party SDK that wants to claim "Accord-compatible (L0 schema)" must
// pass every check here.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { canonicalize, accordHashV0 } from "@accord-protocol/core";
import type { ConformanceCheck, ConformanceLevelResult } from "./types.js";

interface SchemaSet {
  agreement: object;
  verificationReceipt: object;
  settlementReceipt: object;
}

interface RunOptions {
  /** Filesystem path to the repo root containing `schemas/` + `test-vectors/`. */
  repoRoot: string;
}

interface FixtureFamily {
  schemaKey: keyof SchemaSet;
  dir: string;
}

/**
 * Run every L0 schema-compatibility check against the on-disk fixtures.
 *
 * The repoRoot is opt-in so an external SDK can run this against its own
 * vendored copy of `schemas/` + `test-vectors/`. The default points at
 * Accord Protocol's own fixtures.
 */
export async function runL0(opts: RunOptions): Promise<ConformanceLevelResult> {
  const checks: ConformanceCheck[] = [];

  const schemasDir = path.join(opts.repoRoot, "schemas");
  const vectorsDir = path.join(opts.repoRoot, "test-vectors");

  // 1. Load schemas.
  let schemas: SchemaSet;
  try {
    schemas = {
      agreement: JSON.parse(
        fs.readFileSync(path.join(schemasDir, "agreement.v0.schema.json"), "utf-8"),
      ),
      verificationReceipt: JSON.parse(
        fs.readFileSync(
          path.join(schemasDir, "verification-receipt.v0.schema.json"),
          "utf-8",
        ),
      ),
      settlementReceipt: JSON.parse(
        fs.readFileSync(
          path.join(schemasDir, "settlement-receipt.v0.schema.json"),
          "utf-8",
        ),
      ),
    };
  } catch (err) {
    return failureLevel("L0", [
      {
        id: "L0.schema.load",
        level: "L0",
        description: "Load schemas/{agreement,verification-receipt,settlement-receipt}.v0.schema.json",
        result: "fail",
        detail: `failed to read schemas/: ${stringifyError(err)}`,
      },
    ]);
  }

  // ajv is wrapped with `addFormats` for date-time validation; v0 uses second-precision
  // ISO-8601 which the schemas already pin via regex, so this is mostly defensive.
  const Ajv = (Ajv2020 as unknown as { default: typeof Ajv2020 }).default ?? Ajv2020;
  const ajv = new Ajv({ strict: false, allErrors: true });
  (addFormats as unknown as (a: unknown) => void)(ajv);

  // Compile schemas once; ajv uses internal caching but this also catches
  // schema bugs early.
  let validators: Record<keyof SchemaSet, ReturnType<typeof ajv.compile>>;
  try {
    validators = {
      agreement: ajv.compile(schemas.agreement),
      verificationReceipt: ajv.compile(schemas.verificationReceipt),
      settlementReceipt: ajv.compile(schemas.settlementReceipt),
    };
  } catch (err) {
    return failureLevel("L0", [
      {
        id: "L0.schema.compile",
        level: "L0",
        description: "Compile JSON schemas with ajv",
        result: "fail",
        detail: stringifyError(err),
      },
    ]);
  }

  // 2. Walk each fixture family.
  const families: FixtureFamily[] = [
    { schemaKey: "agreement", dir: path.join(vectorsDir, "agreement", "v0") },
    { schemaKey: "verificationReceipt", dir: path.join(vectorsDir, "verification-receipt", "v0") },
    { schemaKey: "settlementReceipt", dir: path.join(vectorsDir, "settlement-receipt", "v0") },
  ];

  for (const fam of families) {
    if (!fs.existsSync(fam.dir)) {
      checks.push({
        id: `L0.fixtures.${fam.schemaKey}.directory-missing`,
        level: "L0",
        description: `${fam.dir} exists`,
        result: "fail",
        detail: `directory not found`,
      });
      continue;
    }

    const fixtures = fs
      .readdirSync(fam.dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (fixtures.length === 0) {
      checks.push({
        id: `L0.fixtures.${fam.schemaKey}.empty`,
        level: "L0",
        description: `${fam.dir} contains at least one fixture`,
        result: "fail",
        detail: "no fixtures found",
      });
      continue;
    }

    for (const f of fixtures) {
      const name = f.replace(/\.json$/, "");
      const expectInvalid = name.startsWith("invalid-");
      const fullPath = path.join(fam.dir, f);
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      } catch (err) {
        checks.push({
          id: `L0.fixtures.${fam.schemaKey}.${name}.parse`,
          level: "L0",
          description: `Parse ${path.relative(opts.repoRoot, fullPath)}`,
          result: "fail",
          detail: stringifyError(err),
        });
        continue;
      }
      // Strip any narrative `_comment` field used for human-readable
      // intent-of-fixture notes — schemas allow extension fields anyway,
      // but we drop it before hashing.
      delete data._comment;

      const validator = validators[fam.schemaKey];
      const valid = validator(data);

      if (expectInvalid) {
        // Reject case: schema MUST reject.
        checks.push({
          id: `L0.schema.${fam.schemaKey}.${name}`,
          level: "L0",
          description: `Reject ${path.relative(opts.repoRoot, fullPath)}`,
          result: valid === false ? "pass" : "fail",
          detail:
            valid === false
              ? undefined
              : `schema accepted an invalid fixture; expected ajv.validate(...) === false`,
        });
        continue;
      }

      // Accept case: schema MUST accept + canonical bytes + hash MUST match pins.
      checks.push({
        id: `L0.schema.${fam.schemaKey}.${name}`,
        level: "L0",
        description: `Validate ${path.relative(opts.repoRoot, fullPath)}`,
        result: valid ? "pass" : "fail",
        detail: valid ? undefined : ajvErrorMessage(validator),
      });

      const canonicalPath = path.join(fam.dir, `${name}.canonical.txt`);
      const hashPath = path.join(fam.dir, `${name}.hash.txt`);

      checks.push(
        runCanonicalCheck(fam.schemaKey, name, canonicalPath, data, opts.repoRoot),
      );
      checks.push(runHashCheck(fam.schemaKey, name, hashPath, data, opts.repoRoot));
    }
  }

  return summariseLevel("L0", checks);
}

function runCanonicalCheck(
  schemaKey: keyof SchemaSet,
  name: string,
  canonicalPath: string,
  data: Record<string, unknown>,
  repoRoot: string,
): ConformanceCheck {
  const id = `L0.canonical.${schemaKey}.${name}`;
  const description = `Canonical bytes match ${path.relative(repoRoot, canonicalPath)}`;
  if (!fs.existsSync(canonicalPath)) {
    return {
      id,
      level: "L0",
      description,
      result: "inconclusive",
      detail: `pinned canonical file is missing — run scripts/derive-fixture-hashes.mjs`,
    };
  }
  const expected = fs.readFileSync(canonicalPath, "utf-8").replace(/\n$/, "");
  const got = canonicalize(data);
  return {
    id,
    level: "L0",
    description,
    result: got === expected ? "pass" : "fail",
    detail:
      got === expected
        ? undefined
        : `canonical bytes drifted; first diff at column ${firstDiffColumn(got, expected)}`,
  };
}

function runHashCheck(
  schemaKey: keyof SchemaSet,
  name: string,
  hashPath: string,
  data: Record<string, unknown>,
  repoRoot: string,
): ConformanceCheck {
  const id = `L0.hash.${schemaKey}.${name}`;
  const description = `accord_hash_v0 matches ${path.relative(repoRoot, hashPath)}`;
  if (!fs.existsSync(hashPath)) {
    return {
      id,
      level: "L0",
      description,
      result: "inconclusive",
      detail: `pinned hash file is missing — run scripts/derive-fixture-hashes.mjs`,
    };
  }
  const expected = fs.readFileSync(hashPath, "utf-8").replace(/\n$/, "");
  const got = accordHashV0(data);
  return {
    id,
    level: "L0",
    description,
    result: got === expected ? "pass" : "fail",
    detail: got === expected ? undefined : `expected ${expected}, got ${got}`,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function summariseLevel(
  level: ConformanceLevelResult["level"],
  checks: ConformanceCheck[],
): ConformanceLevelResult {
  const passed_count = checks.filter((c) => c.result === "pass").length;
  const failed_count = checks.filter((c) => c.result === "fail").length;
  const inconclusive_count = checks.filter((c) => c.result === "inconclusive").length;
  return {
    level,
    passed: failed_count === 0 && inconclusive_count === 0,
    passed_count,
    failed_count,
    inconclusive_count,
    checks,
  };
}

function failureLevel(
  level: ConformanceLevelResult["level"],
  checks: ConformanceCheck[],
): ConformanceLevelResult {
  return summariseLevel(level, checks);
}

function ajvErrorMessage(validator: { errors?: unknown }): string {
  const errs = validator.errors;
  if (!errs || !Array.isArray(errs)) return "schema validation failed";
  return JSON.stringify(errs, null, 2);
}

function firstDiffColumn(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
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
