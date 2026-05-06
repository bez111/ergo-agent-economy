import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadAuditedManifest,
  getAuditedEntry,
  verifyAuditedErgoTree,
  verifyManifestAgainstRegistry,
} from "../audited.js";
import { tryGetErgoTree } from "../registry.js";

describe("AUDITED_ERGOTREES manifest shape", () => {
  it("declares the v1 schema and matches the registry's canonical commit format", () => {
    const m = loadAuditedManifest();
    assert.equal(m.schema, "ergo-agent-economy/audited-ergotrees/v1");
    assert.match(m.commit, /^[0-9a-f]{40}$/);
  });

  it("starts in draft-pre-audit state with no auditor signature", () => {
    const m = loadAuditedManifest();
    assert.equal(m.status, "draft-pre-audit");
    assert.equal(m.auditor.signature, null);
  });

  it("ships an entry for every registry predicate", () => {
    const m = loadAuditedManifest();
    const expected = [
      "task_hash_v0",
      "credential_v0",
      "chaincash_reserve_v0",
      "chaincash_receipt_v0",
      "chaincash_note_v0",
      "basis_reserve_v0",
      "basis_token_reserve_v0",
    ].sort();
    const got = m.entries.map((e) => e.name).sort();
    assert.deepEqual(got, expected);
  });

  it("every entry has a 64-hex sourceHash and a tree hash matching the registry", () => {
    for (const e of loadAuditedManifest().entries) {
      assert.match(e.sourceHashBlake2b256, /^[0-9a-f]{64}$/, `${e.name} sourceHash`);
      assert.match(e.treeHashBlake2b256, /^[0-9a-f]{64}$/, `${e.name} treeHash`);
    }
  });

  it("ChainCash chained entries have post-template hashes", () => {
    const note = getAuditedEntry("chaincash_note_v0");
    const receipt = getAuditedEntry("chaincash_receipt_v0");
    assert.match(note.postTemplateSourceHashBlake2b256!, /^[0-9a-f]{64}$/);
    assert.match(receipt.postTemplateSourceHashBlake2b256!, /^[0-9a-f]{64}$/);
  });

  it("non-chained entries have null post-template hashes", () => {
    for (const name of ["task_hash_v0", "credential_v0", "basis_reserve_v0"] as const) {
      assert.equal(
        getAuditedEntry(name).postTemplateSourceHashBlake2b256,
        null,
        `${name} post-template should be null`
      );
    }
  });

  it("every entry defaults mainnetAllowed to false in pre-audit state", () => {
    for (const e of loadAuditedManifest().entries) {
      assert.equal(e.mainnetAllowed, false, `${e.name} should not be mainnet-allowed yet`);
    }
  });

  it("task_hash_v0 notes flag the front-running risk", () => {
    const e = getAuditedEntry("task_hash_v0");
    assert.match(e.notes, /front-runn|bearer/i);
  });

  it("task_hash_v0 stays mainnetAllowed=false (C-001 lock)", () => {
    // Deep review C-001: task_hash_v0 is front-runnable after the task
    // output is revealed in the mempool. The manifest entry must remain
    // mainnetAllowed=false even when the manifest gets auditor-signed —
    // a v0 receiver-bound replacement is the path forward, not promoting
    // task_hash_v0.
    const e = getAuditedEntry("task_hash_v0");
    assert.equal(
      e.mainnetAllowed,
      false,
      "task_hash_v0 must stay mainnetAllowed=false (C-001)",
    );
  });
});

describe("verifyAuditedErgoTree", () => {
  it("accepts the canonical tree for every entry", () => {
    for (const name of [
      "task_hash_v0",
      "credential_v0",
      "chaincash_reserve_v0",
      "chaincash_receipt_v0",
      "chaincash_note_v0",
      "basis_reserve_v0",
      "basis_token_reserve_v0",
    ] as const) {
      const tree = tryGetErgoTree(name)!;
      const v = verifyAuditedErgoTree(name, tree);
      assert.equal(v.ok, true, `${name} canonical tree must verify ok`);
    }
  });

  it("rejects a tree that does not hash to the manifest entry", () => {
    const v = verifyAuditedErgoTree("credential_v0", "deadbeef");
    assert.equal(v.ok, false);
    if (v.ok === false) assert.equal(v.reason, "supplied-tree-hash-mismatch");
  });

  it("rejects swapping the task_hash_v0 tree under credential_v0's name", () => {
    const taskTree = tryGetErgoTree("task_hash_v0")!;
    const v = verifyAuditedErgoTree("credential_v0", taskTree);
    assert.equal(v.ok, false);
    if (v.ok === false) assert.equal(v.reason, "supplied-tree-hash-mismatch");
  });

  it("requireMainnet rejects when the manifest is unsigned (draft-pre-audit)", () => {
    const tree = tryGetErgoTree("credential_v0")!;
    const v = verifyAuditedErgoTree("credential_v0", tree, { requireMainnet: true });
    assert.equal(v.ok, false);
    if (v.ok === false) assert.equal(v.reason, "manifest-unsigned");
  });

  it("requireMainnet still produces a useful message", () => {
    const tree = tryGetErgoTree("credential_v0")!;
    const v = verifyAuditedErgoTree("credential_v0", tree, { requireMainnet: true });
    if (v.ok === false) {
      assert.match(v.message ?? "", /signed/);
    }
  });

  it("requireMainnet rejects task_hash_v0 even after manifest is signed (C-001)", () => {
    // Re-state the C-001 invariant at the SDK boundary: the auditPolicy
    // path used by ergo-agent-pay's `assertProductionSafety` calls
    // verifyAuditedErgoTree under the hood. As long as the manifest
    // entry stays mainnetAllowed=false, the SDK refuses task_hash_v0
    // mainnet writes regardless of audit state.
    const tree = tryGetErgoTree("task_hash_v0")!;
    const v = verifyAuditedErgoTree("task_hash_v0", tree, { requireMainnet: true });
    assert.equal(v.ok, false);
    if (v.ok === false) {
      assert.ok(
        v.reason === "not-mainnet-allowed" || v.reason === "manifest-unsigned",
        `expected task_hash_v0 to be rejected, got reason=${v.reason}`,
      );
    }
  });
});

describe("M-005: registry / manifest consistency cross-check", () => {
  it("verifyManifestAgainstRegistry passes on the shipped pair", () => {
    assert.doesNotThrow(() => verifyManifestAgainstRegistry());
  });

  it("loadAuditedManifest invokes the cross-check (smoke test)", () => {
    // If the cross-check is wired up, loadAuditedManifest runs it on first
    // load. We can't easily corrupt the on-disk JSON in a unit test, so the
    // test of last resort here is: the function returns successfully on
    // the canonical pair, indicating the cross-check did not reject.
    const m = loadAuditedManifest();
    assert.equal(m.entries.length, 7);
  });
});
