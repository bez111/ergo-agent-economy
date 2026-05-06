import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { BaseAgentPay, BaseAgentPayError, computeTaskHash, NO_TASK_HASH } from "../index.js";

// ── mock viem clients ────────────────────────────────────────────────────────

const RESERVE: Address = "0x000000000000000000000000000000000000a999";
const TOKEN: Address = "0x000000000000000000000000000000000000b888";
const AGENT: Address = "0x0000000000000000000000000000000000000123";
const RECIPIENT: Address = "0x0000000000000000000000000000000000000456";

interface MockState {
  blockNumber: bigint;
  reserveBalances: Map<string, bigint>;
  tokenBalances: Map<string, bigint>;
  decimals: number;
  /** Pre-computed noteId returned by previewNoteId. */
  nextNoteId: Hex;
  /** Tx hashes returned by writeContract calls, keyed by call number. */
  txHashes: Hex[];
  txReceipts: Map<Hex, { logs: { topics: Hex[]; data: Hex; address: Address }[] }>;
  /** Last write captured for assertion. */
  lastWrite?: { functionName: string; args: unknown[]; address: Address };
}

function makeMockClients(state: MockState): { publicClient: PublicClient; walletClient: WalletClient } {
  const publicClient = {
    async getBlockNumber() {
      return state.blockNumber;
    },
    async getBytecode() {
      return "0x6080604052" as Hex; // non-empty; bypasses the "not deployed" branch
    },
    async readContract(args: { address: Address; functionName: string; args?: unknown[] }) {
      const fn = args.functionName;
      switch (fn) {
        case "reserveBalance":
          return state.reserveBalances.get((args.args![0] as Address).toLowerCase()) ?? 0n;
        case "balanceOf":
          return state.tokenBalances.get((args.args![0] as Address).toLowerCase()) ?? 0n;
        case "decimals":
          return state.decimals;
        case "previewNoteId":
          return state.nextNoteId;
        case "getNote":
          return {
            issuer: AGENT,
            recipient: RECIPIENT,
            amount: 5_000_000n,
            expiryBlock: state.blockNumber + 100n,
            taskHash: NO_TASK_HASH,
            redeemed: false,
          };
        default:
          throw new Error(`unmocked readContract: ${fn}`);
      }
    },
    async waitForTransactionReceipt(args: { hash: Hex }) {
      return state.txReceipts.get(args.hash) ?? { logs: [] };
    },
  } as unknown as PublicClient;

  let writeIdx = 0;
  const walletClient = {
    async writeContract(args: { address: Address; functionName: string; args: unknown[] }) {
      state.lastWrite = { functionName: args.functionName, args: args.args, address: args.address };
      const hash = state.txHashes[writeIdx++] ?? (`0x${"f".repeat(64)}` as Hex);
      return hash;
    },
  } as unknown as WalletClient;

  return { publicClient, walletClient };
}

function freshState(overrides: Partial<MockState> = {}): MockState {
  return {
    blockNumber: 1_000_000n,
    reserveBalances: new Map(),
    tokenBalances: new Map(),
    decimals: 6,
    nextNoteId: ("0x" + "ab".repeat(32)) as Hex,
    txHashes: ["0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
               "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex],
    txReceipts: new Map(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("BaseAgentPay — read-side", () => {
  it("getReserveBalance forwards to reserveBalance(address)", async () => {
    const state = freshState();
    state.reserveBalances.set(AGENT.toLowerCase(), 5_000_000n);
    const { publicClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
    assert.equal(await agent.getReserveBalance(), 5_000_000n);
  });

  it("getTokenBalance forwards to balanceOf(address)", async () => {
    const state = freshState();
    state.tokenBalances.set(AGENT.toLowerCase(), 9_000n);
    const { publicClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
    assert.equal(await agent.getTokenBalance(), 9_000n);
  });

  it("getTokenDecimals returns the ERC-20 decimals", async () => {
    const state = freshState({ decimals: 18 });
    const { publicClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
    assert.equal(await agent.getTokenDecimals(), 18);
  });

  it("getBlockNumber returns the chain head", async () => {
    const state = freshState({ blockNumber: 42n });
    const { publicClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
    assert.equal(await agent.getBlockNumber(), 42n);
  });
});

describe("BaseAgentPay — checkNote", () => {
  it("returns NoteInfo with isExpired derived from current block", async () => {
    const state = freshState();
    const { publicClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
    const info = await agent.checkNote("0xabcd" as Hex);
    assert.equal(info.exists, true);
    assert.equal(info.isExpired, false);
    assert.equal(info.amount, 5_000_000n);
    assert.equal(info.recipient, RECIPIENT);
  });
});

describe("BaseAgentPay — write-side require walletClient", () => {
  function readonlyAgent() {
    const state = freshState();
    const { publicClient } = makeMockClients(state);
    return new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient,
    });
  }

  for (const op of [
    () => readonlyAgent().topUp(1n),
    () => readonlyAgent().withdraw(1n),
    () => readonlyAgent().refundExpired("0xabcd" as Hex),
    () => readonlyAgent().redeemNote("0xabcd" as Hex),
    () =>
      readonlyAgent().issueNote({
        recipient: RECIPIENT,
        amount: 1n,
        expiry: "+10 blocks",
      }),
  ]) {
    it(`throws NO_WALLET_CLIENT for ${op.toString().slice(0, 60).replace(/\s+/g, " ")}…`, async () => {
      await assert.rejects(
        op,
        (e: unknown) =>
          e instanceof BaseAgentPayError && e.code === "NO_WALLET_CLIENT"
      );
    });
  }
});

describe("BaseAgentPay — issueNote", () => {
  it("rejects amount <= 0", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    await assert.rejects(
      () =>
        agent.issueNote({
          recipient: RECIPIENT,
          amount: 0n,
          expiry: "+10 blocks",
        }),
      (e: unknown) => e instanceof BaseAgentPayError && e.code === "INVALID_AMOUNT"
    );
  });

  it("resolves +N blocks expiry against current head", async () => {
    const state = freshState({ blockNumber: 1_000_000n });
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    await agent.issueNote({
      recipient: RECIPIENT,
      amount: 1_000_000n,
      expiry: "+50 blocks",
    });
    assert.equal(state.lastWrite?.functionName, "issueNote");
    assert.equal((state.lastWrite!.args as unknown[])[2], 1_000_050n);
  });

  it("forwards taskHash unchanged", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    const hash = computeTaskHash("the answer is 42");
    await agent.issueNote({
      recipient: RECIPIENT,
      amount: 1_000_000n,
      expiry: 1_000_100n,
      taskHash: hash,
    });
    assert.equal((state.lastWrite!.args as unknown[])[3], hash);
  });

  it("defaults taskHash to NO_TASK_HASH when omitted", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    await agent.issueNote({
      recipient: RECIPIENT,
      amount: 1n,
      expiry: 1_000_100n,
    });
    assert.equal((state.lastWrite!.args as unknown[])[3], NO_TASK_HASH);
  });

  it("rejects malformed +blocks expiry strings", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    await assert.rejects(
      () =>
        agent.issueNote({
          recipient: RECIPIENT,
          amount: 1n,
          // @ts-expect-error — invalid by design
          expiry: "100 blocks", // missing leading +
        }),
      (e: unknown) =>
        e instanceof BaseAgentPayError && e.code === "INVALID_EXPIRY"
    );
  });

  it("returns the previewed noteId when no event matches", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    const r = await agent.issueNote({
      recipient: RECIPIENT,
      amount: 1n,
      expiry: "+10 blocks",
    });
    assert.equal(r.noteId, ("0x" + "ab".repeat(32)) as Hex);
  });
});

describe("BaseAgentPay — topUp / withdraw / redeem / refund", () => {
  function withAgent() {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base-sepolia",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    return { agent, state };
  }

  it("topUp issues approve then topUp tx", async () => {
    const { agent, state } = withAgent();
    const r = await agent.topUp(5_000_000n);
    assert.ok(r.approveTxHash);
    assert.ok(r.topUpTxHash);
    // Last write was the topUp call (approve was recorded earlier).
    assert.equal(state.lastWrite?.functionName, "topUp");
    assert.equal((state.lastWrite!.args as unknown[])[0], 5_000_000n);
  });

  it("withdraw forwards the amount", async () => {
    const { agent, state } = withAgent();
    await agent.withdraw(2_000_000n);
    assert.equal(state.lastWrite?.functionName, "withdraw");
    assert.equal((state.lastWrite!.args as unknown[])[0], 2_000_000n);
  });

  it("redeemNote encodes a string taskOutput as 0x-bytes", async () => {
    const { agent, state } = withAgent();
    await agent.redeemNote("0xabcd" as Hex, "the answer is 42");
    assert.equal(state.lastWrite?.functionName, "redeemNote");
    const args = state.lastWrite!.args as unknown[];
    assert.equal(args[0], "0xabcd");
    // 0x prefix + UTF-8 hex of "the answer is 42"
    assert.equal(
      args[1],
      "0x" + Buffer.from("the answer is 42", "utf-8").toString("hex")
    );
  });

  it("redeemNote uses 0x for an empty taskOutput", async () => {
    const { agent, state } = withAgent();
    await agent.redeemNote("0xabcd" as Hex);
    assert.equal((state.lastWrite!.args as unknown[])[1], "0x");
  });

  it("redeemNote accepts a Uint8Array taskOutput", async () => {
    const { agent, state } = withAgent();
    await agent.redeemNote("0xabcd" as Hex, new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    assert.equal((state.lastWrite!.args as unknown[])[1], "0xdeadbeef");
  });

  it("refundExpired forwards the noteId", async () => {
    const { agent, state } = withAgent();
    await agent.refundExpired("0xabcd" as Hex);
    assert.equal(state.lastWrite?.functionName, "refundExpired");
    assert.equal((state.lastWrite!.args as unknown[])[0], "0xabcd");
  });
});

describe("BaseAgentPay — mainnet audit gate", () => {
  it("refuses topUp on `base` without auditPolicy", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
    });
    await assert.rejects(
      () => agent.topUp(1n),
      (e: unknown) =>
        e instanceof BaseAgentPayError && e.code === "UNAUDITED_CONTRACT"
    );
  });

  it("allows topUp on `base` when dangerouslyAllowUnauditedContract is true", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
      dangerouslyAllowUnauditedContract: true,
    });
    const r = await agent.topUp(1n);
    assert.ok(r.topUpTxHash);
  });

  it("auditPolicy decides on `base`", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
      auditPolicy: () => ({ ok: true }),
    });
    await agent.withdraw(1n);
    assert.equal(state.lastWrite?.functionName, "withdraw");
  });

  it("auditPolicy can refuse", async () => {
    const state = freshState();
    const { publicClient, walletClient } = makeMockClients(state);
    const agent = new BaseAgentPay({
      address: AGENT, network: "base",
      reserveContract: RESERVE, tokenContract: TOKEN,
      publicClient, walletClient,
      auditPolicy: () => ({ ok: false, reason: "stub-rejected" }),
    });
    await assert.rejects(
      () => agent.withdraw(1n),
      (e: unknown) =>
        e instanceof BaseAgentPayError &&
        e.code === "UNAUDITED_CONTRACT" &&
        /stub-rejected/.test(e.message)
    );
  });
});
