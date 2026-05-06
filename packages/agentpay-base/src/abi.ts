// ─────────────────────────────────────────────────────────────────────────────
// agentpay-base — contract ABIs
//
// Hand-written ABIs for AgentPayReserveV0 + the minimal ERC-20 surface we
// need (transfer, transferFrom, approve, balanceOf, decimals). Hand-written
// rather than generated so the package can ship without the Solidity toolchain
// in CI; bytecode-level fidelity is checked at deployment time via the
// audit manifest.
// ─────────────────────────────────────────────────────────────────────────────

export const RESERVE_ABI = [
  // ── reads ──
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "reserveBalance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nonceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "previewNoteId",
    stateMutability: "view",
    inputs: [{ name: "issuer", type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getNote",
    stateMutability: "view",
    inputs: [{ name: "noteId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "issuer", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiryBlock", type: "uint256" },
          { name: "taskHash", type: "bytes32" },
          { name: "redeemed", type: "bool" },
        ],
      },
    ],
  },
  // ── writes ──
  {
    type: "function",
    name: "topUp",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "issueNote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiryBlock", type: "uint256" },
      { name: "taskHash", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "redeemNote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "noteId", type: "bytes32" },
      { name: "taskOutput", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "noteId", type: "bytes32" }],
    outputs: [],
  },
  // ── events ──
  {
    type: "event",
    name: "NoteIssued",
    inputs: [
      { indexed: true, name: "noteId", type: "bytes32" },
      { indexed: true, name: "issuer", type: "address" },
      { indexed: true, name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiryBlock", type: "uint256" },
      { name: "taskHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "NoteRedeemed",
    inputs: [
      { indexed: true, name: "noteId", type: "bytes32" },
      { indexed: true, name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "NoteRefunded",
    inputs: [
      { indexed: true, name: "noteId", type: "bytes32" },
      { indexed: true, name: "issuer", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
