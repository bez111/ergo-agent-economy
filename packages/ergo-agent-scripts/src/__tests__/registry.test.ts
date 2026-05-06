import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadRegistry,
  getPredicate,
  tryGetErgoTree,
  hashErgoTree,
  verifyErgoTree,
} from "../registry.js";

describe("registry shape", () => {
  it("declares the v0 spec", () => {
    const r = loadRegistry();
    assert.equal(r.version, "v0");
    assert.match(r.spec, /SPEC\.md/);
  });

  it("ships every v0 predicate (acceptance + ChainCash + Basis)", () => {
    const names = loadRegistry().predicates.map((p) => p.name).sort();
    assert.deepEqual(names, [
      "basis_reserve_v0",
      "basis_token_reserve_v0",
      "chaincash_note_v0",
      "chaincash_receipt_v0",
      "chaincash_reserve_v0",
      "credential_v0",
      "task_hash_v0",
    ]);
  });

  it("every entry has source, hex (or null), and stable tree-hash shape", () => {
    for (const p of loadRegistry().predicates) {
      assert.ok(p.source && p.source.length > 0, `${p.name} source empty`);
      assert.ok(
        p.ergoTreeHex === null || /^[0-9a-fA-F]+$/.test(p.ergoTreeHex),
        `${p.name} ergoTreeHex must be null or hex`
      );
      if (p.ergoTreeHex !== null) {
        assert.equal(p.ergoTreeHex.length % 2, 0, `${p.name} ergoTreeHex odd length`);
        assert.match(
          p.treeHashBlake2b256!,
          /^[0-9a-f]{64}$/,
          `${p.name} treeHashBlake2b256 must be 64 hex chars when tree is set`
        );
      }
    }
  });

  it("entries with sourceFile resolve to a non-empty source string", () => {
    const withFiles = loadRegistry().predicates.filter((p) => p.sourceFile);
    assert.ok(withFiles.length >= 5, "expected ChainCash + Basis entries to use sourceFile");
    for (const p of withFiles) {
      assert.ok((p.source ?? "").length > 0, `${p.name}: sourceFile did not load`);
    }
  });
});

describe("getPredicate", () => {
  it("returns task_hash_v0 with the right register layout", () => {
    const p = getPredicate("task_hash_v0");
    assert.equal(p.name, "task_hash_v0");
    assert.ok(p.registers!["R5"]?.includes("expiry"));
    assert.ok(p.registers!["R6"]?.includes("hash"));
    assert.ok(p.context_variables!["0"]?.includes("Coll[Byte]"));
  });

  it("returns credential_v0 with R7 group element", () => {
    const p = getPredicate("credential_v0");
    assert.ok(p.registers!["R7"]?.toLowerCase().includes("groupelement"));
  });

  it("returns chaincash_note_v0 with template-variable metadata", () => {
    const p = getPredicate("chaincash_note_v0");
    assert.ok(p.templateVariables);
    assert.ok("reserveContractHash" in p.templateVariables!);
    assert.ok("receiptContractHash" in p.templateVariables!);
    assert.deepEqual(p.dependsOn, ["chaincash_reserve_v0", "chaincash_receipt_v0"]);
  });

  it("throws on an unknown name", () => {
    assert.throws(
      // @ts-expect-error — intentionally invalid
      () => getPredicate("does_not_exist"),
      /Unknown predicate/
    );
  });
});

describe("tryGetErgoTree", () => {
  const ALL: ReadonlyArray<Parameters<typeof tryGetErgoTree>[0]> = [
    "task_hash_v0",
    "credential_v0",
    "chaincash_reserve_v0",
    "chaincash_receipt_v0",
    "chaincash_note_v0",
    "basis_reserve_v0",
    "basis_token_reserve_v0",
  ];

  for (const name of ALL) {
    it(`returns a non-null ergoTreeHex for ${name}`, () => {
      const tree = tryGetErgoTree(name);
      assert.ok(tree, `${name} ergoTreeHex must be populated`);
      assert.match(tree!, /^[0-9a-fA-F]+$/);
      assert.equal(tree!.length % 2, 0);
    });
  }

  it("all seven trees are pairwise distinct", () => {
    const trees = ALL.map((n) => tryGetErgoTree(n));
    assert.equal(new Set(trees).size, ALL.length, "expected unique trees");
  });
});

describe("tree bytes match recorded BLAKE2b-256 hashes", () => {
  for (const name of [
    "task_hash_v0",
    "credential_v0",
    "chaincash_reserve_v0",
    "chaincash_receipt_v0",
    "chaincash_note_v0",
    "basis_reserve_v0",
    "basis_token_reserve_v0",
  ] as const) {
    it(`${name} hash matches`, () => {
      const tree = tryGetErgoTree(name)!;
      const recorded = getPredicate(name).treeHashBlake2b256!;
      assert.equal(hashErgoTree(tree), recorded);
    });
  }
});

describe("hashErgoTree", () => {
  it("BLAKE2b-256 of the empty hex string", () => {
    assert.equal(
      hashErgoTree(""),
      "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8"
    );
  });

  it("matches a known vector for a single 0xff byte", () => {
    // BLAKE2b-256 of a single 0xff byte
    const got = hashErgoTree("ff");
    assert.equal(got.length, 64);
    assert.match(got, /^[0-9a-f]+$/);
  });

  it("rejects malformed hex", () => {
    assert.throws(() => hashErgoTree("zz"), /even-length hex/);
    assert.throws(() => hashErgoTree("a"), /even-length hex/);
  });
});

describe("verifyErgoTree", () => {
  it("accepts the canonical task_hash_v0 tree", () => {
    const tree = tryGetErgoTree("task_hash_v0")!;
    assert.deepEqual(verifyErgoTree("task_hash_v0", tree), { ok: true });
  });

  it("accepts the canonical credential_v0 tree", () => {
    const tree = tryGetErgoTree("credential_v0")!;
    assert.deepEqual(verifyErgoTree("credential_v0", tree), { ok: true });
  });

  it("rejects a tree that does not match the recorded hash", () => {
    const result = verifyErgoTree("task_hash_v0", "deadbeef");
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.match(result.reason, /tree hash mismatch/);
    }
  });

  it("rejects a tree from one predicate when verified as another", () => {
    const taskTree = tryGetErgoTree("task_hash_v0")!;
    const result = verifyErgoTree("credential_v0", taskTree);
    assert.equal(result.ok, false);
  });
});
