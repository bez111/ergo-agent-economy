import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, type Hex, type PublicClient } from "viem";
import { assertProductionSafety, BaseAgentPayError } from "../index.js";
import type { AuditPolicy } from "../index.js";

const FAKE_BYTECODE: Hex = "0x60806040523480f3" as Hex;
const FAKE_BYTECODE_HASH = keccak256(FAKE_BYTECODE);

function publicClientWithBytecode(code: Hex): PublicClient {
  return {
    getBytecode: async () => code,
  } as unknown as PublicClient;
}

describe("assertProductionSafety — base-sepolia bypass", () => {
  it("allows base-sepolia without auditPolicy", async () => {
    await assert.doesNotReject(() =>
      assertProductionSafety({
        operation: "issueNote",
        network: "base-sepolia",
        reserveContract: "0x0000000000000000000000000000000000000001",
        publicClient: publicClientWithBytecode(FAKE_BYTECODE),
      })
    );
  });
});

describe("assertProductionSafety — base mainnet audit gate", () => {
  it("rejects without auditPolicy and without dangerous opt-in", async () => {
    await assert.rejects(
      () =>
        assertProductionSafety({
          operation: "issueNote",
          network: "base",
          reserveContract: "0x0000000000000000000000000000000000000001",
          publicClient: publicClientWithBytecode(FAKE_BYTECODE),
        }),
      (e: unknown) =>
        e instanceof BaseAgentPayError && e.code === "UNAUDITED_CONTRACT"
    );
  });

  it("rejects when auditPolicy returns ok=false", async () => {
    const policy: AuditPolicy = () => ({ ok: false, reason: "stub-rejected" });
    await assert.rejects(
      () =>
        assertProductionSafety({
          operation: "issueNote",
          network: "base",
          reserveContract: "0x0000000000000000000000000000000000000001",
          publicClient: publicClientWithBytecode(FAKE_BYTECODE),
          auditPolicy: policy,
        }),
      (e: unknown) =>
        e instanceof BaseAgentPayError &&
        e.code === "UNAUDITED_CONTRACT" &&
        /stub-rejected/.test(e.message)
    );
  });

  it("allows when auditPolicy returns ok=true", async () => {
    const policy: AuditPolicy = () => ({ ok: true });
    await assert.doesNotReject(() =>
      assertProductionSafety({
        operation: "issueNote",
        network: "base",
        reserveContract: "0x0000000000000000000000000000000000000001",
        publicClient: publicClientWithBytecode(FAKE_BYTECODE),
        auditPolicy: policy,
      })
    );
  });

  it("dangerouslyAllowUnauditedContract bypasses audit policy", async () => {
    await assert.doesNotReject(() =>
      assertProductionSafety({
        operation: "issueNote",
        network: "base",
        reserveContract: "0x0000000000000000000000000000000000000001",
        publicClient: publicClientWithBytecode(FAKE_BYTECODE),
        dangerouslyAllowUnauditedContract: true,
      })
    );
  });

  it("converts a thrown auditPolicy into UNAUDITED_CONTRACT", async () => {
    const policy: AuditPolicy = () => {
      throw new Error("oops");
    };
    await assert.rejects(
      () =>
        assertProductionSafety({
          operation: "issueNote",
          network: "base",
          reserveContract: "0x0000000000000000000000000000000000000001",
          publicClient: publicClientWithBytecode(FAKE_BYTECODE),
          auditPolicy: policy,
        }),
      (e: unknown) =>
        e instanceof BaseAgentPayError &&
        e.code === "UNAUDITED_CONTRACT" &&
        /oops/.test(e.message)
    );
  });

  it("auditPolicy receives the bytecode hash + network", async () => {
    interface Observed { hash: Hex; net: string }
    let observed: Observed | null = null;
    const policy: AuditPolicy = (hash, network) => {
      observed = { hash, net: network };
      return { ok: true };
    };
    await assertProductionSafety({
      operation: "issueNote",
      network: "base",
      reserveContract: "0x0000000000000000000000000000000000000001",
      publicClient: publicClientWithBytecode(FAKE_BYTECODE),
      auditPolicy: policy,
    });
    assert.ok(observed);
    const o = observed as Observed;
    assert.equal(o.hash, FAKE_BYTECODE_HASH);
    assert.equal(o.net, "base");
  });
});

describe("assertProductionSafety — bytecode missing", () => {
  it("throws UNAUDITED_CONTRACT if no code at the address", async () => {
    const empty = publicClientWithBytecode("0x" as Hex);
    const policy: AuditPolicy = () => ({ ok: true });
    await assert.rejects(
      () =>
        assertProductionSafety({
          operation: "issueNote",
          network: "base",
          reserveContract: "0x0000000000000000000000000000000000000001",
          publicClient: empty,
          auditPolicy: policy,
        }),
      (e: unknown) =>
        e instanceof BaseAgentPayError &&
        e.code === "UNAUDITED_CONTRACT" &&
        /not deployed/i.test(e.message)
    );
  });
});
