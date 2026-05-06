// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentPayReserveV0
 * @notice Reserve / Note settlement for the AgentPay v0 protocol on EVM chains.
 *
 *   This contract mirrors the eUTXO Ergo design (Reserve, Note, Tracker,
 *   Acceptance Predicate) onto an account-model EVM. Differences from the
 *   Ergo implementation are documented in `docs/cross-chain.md`:
 *
 *   * **Hashing.** Acceptance predicates use `keccak256` (EVM-native, free
 *     gas-wise) instead of BLAKE2b-256 (Ergo-native). The protocol is
 *     hash-function-agnostic at the spec level; SDKs route the right
 *     primitive per backend.
 *
 *   * **Receiver binding.** EVM's `msg.sender` is authenticated by the EVM
 *     itself; the contract enforces `msg.sender == note.recipient` on the
 *     redemption path. This is the on-EVM equivalent of `proveDlog(R7)`
 *     in `credential_v0` and is built-in protection against the
 *     mempool-front-run risk of `task_hash_v0`.
 *
 *   * **Tracker.** EVM's account model gives anti-double-spend for free
 *     via the `redeemed` flag stored in the Note struct. The Ergo
 *     `Tracker` box has no on-EVM analogue.
 *
 *   * **Refund.** After expiry, the issuer can pull the locked amount
 *     back into their reserve balance via `refundExpired`. Ergo's design
 *     leaves expired Notes as ash; on EVM we make the refund explicit.
 *
 *   Mainnet readiness gate: this contract has not been externally
 *   audited. The TS adapter refuses mainnet writes unless its audit
 *   manifest declares `mainnetAllowed: true` for the deployed bytecode
 *   hash. Until then, deploy on Base Sepolia.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract AgentPayReserveV0 {
    /// @notice The ERC-20 token this reserve denominates value in. Pinned at deployment;
    ///         a single deployment serves a single token (e.g. USDC).
    IERC20 public immutable token;

    struct Note {
        address issuer;        // who created it (drained from their reserve)
        address recipient;     // who can redeem it
        uint256 amount;        // in `token` base units (USDC: 6 decimals)
        uint256 expiryBlock;   // block.number >= expiryBlock => non-redeemable; refundable
        bytes32 taskHash;      // keccak256 of expected task output. zero = no predicate
        bool redeemed;         // anti-double-spend
    }

    /// @notice Cumulative reserve balance per address (token base units).
    mapping(address => uint256) public reserveBalance;

    /// @notice All issued Notes, keyed by their deterministic id.
    mapping(bytes32 => Note) public notes;

    /// @notice Per-issuer monotonic nonce used to derive note ids.
    mapping(address => uint256) public nonceOf;

    /// @notice Reentrancy lock — set during external token transfers.
    uint256 private _locked;

    event ReserveToppedUp(address indexed owner, uint256 amount, uint256 newBalance);
    event ReserveWithdrawn(address indexed owner, uint256 amount, uint256 newBalance);
    event NoteIssued(
        bytes32 indexed noteId,
        address indexed issuer,
        address indexed recipient,
        uint256 amount,
        uint256 expiryBlock,
        bytes32 taskHash
    );
    event NoteRedeemed(bytes32 indexed noteId, address indexed recipient, uint256 amount);
    event NoteRefunded(bytes32 indexed noteId, address indexed issuer, uint256 amount);

    error AmountZero();
    error InsufficientReserve();
    error NoteAlreadyExists();
    error NoteNotFound();
    error NoteExpired();
    error NoteNotYetExpired();
    error NoteAlreadyRedeemed();
    error InvalidTaskOutput();
    error NotRecipient();
    error NotIssuer();
    error TokenTransferFailed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (_locked != 0) revert ReentrantCall();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(IERC20 erc20) {
        token = erc20;
    }

    // ────────────────────────────────────────────────────────────────
    // Reserve management
    // ────────────────────────────────────────────────────────────────

    /// @notice Move `amount` of `token` from msg.sender into their reserve balance.
    ///         The caller must `approve(this, amount)` on the token first.
    function topUp(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TokenTransferFailed();
        reserveBalance[msg.sender] += amount;
        emit ReserveToppedUp(msg.sender, amount, reserveBalance[msg.sender]);
    }

    /// @notice Withdraw `amount` from the caller's reserve balance back to their wallet.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        if (reserveBalance[msg.sender] < amount) revert InsufficientReserve();
        reserveBalance[msg.sender] -= amount;
        if (!token.transfer(msg.sender, amount)) revert TokenTransferFailed();
        emit ReserveWithdrawn(msg.sender, amount, reserveBalance[msg.sender]);
    }

    // ────────────────────────────────────────────────────────────────
    // Note lifecycle
    // ────────────────────────────────────────────────────────────────

    /// @notice Issue a Note drawn against the caller's reserve.
    /// @param recipient    Who can redeem the Note. msg.sender == recipient is enforced on redeem.
    /// @param amount       Amount in `token` base units. Must be ≤ caller's reserve balance.
    /// @param expiryBlock  block.number ≥ this height makes the Note refundable but not redeemable.
    /// @param taskHash     keccak256 of the expected task output, or bytes32(0) for an unconditional Note.
    /// @return noteId      Deterministic id derived from msg.sender, nonce, and contract address.
    function issueNote(
        address recipient,
        uint256 amount,
        uint256 expiryBlock,
        bytes32 taskHash
    ) external returns (bytes32 noteId) {
        if (amount == 0) revert AmountZero();
        if (recipient == address(0)) revert NotRecipient();
        if (reserveBalance[msg.sender] < amount) revert InsufficientReserve();

        uint256 n = nonceOf[msg.sender]++;
        noteId = keccak256(abi.encode(msg.sender, n, address(this)));
        if (notes[noteId].issuer != address(0)) revert NoteAlreadyExists();

        notes[noteId] = Note({
            issuer: msg.sender,
            recipient: recipient,
            amount: amount,
            expiryBlock: expiryBlock,
            taskHash: taskHash,
            redeemed: false
        });

        // Lock the funds in the Note. They will return to msg.sender's
        // reserve via refundExpired() OR transfer to recipient via redeemNote().
        reserveBalance[msg.sender] -= amount;

        emit NoteIssued(noteId, msg.sender, recipient, amount, expiryBlock, taskHash);
    }

    /// @notice Redeem a Note before expiry. Caller must be the recipient.
    /// @param noteId     The Note's deterministic id.
    /// @param taskOutput Bytes whose keccak256 must equal note.taskHash. Pass empty
    ///                   bytes for unconditional (zero-hash) Notes.
    function redeemNote(bytes32 noteId, bytes calldata taskOutput) external nonReentrant {
        Note storage n = notes[noteId];
        if (n.issuer == address(0)) revert NoteNotFound();
        if (n.redeemed) revert NoteAlreadyRedeemed();
        if (block.number >= n.expiryBlock) revert NoteExpired();
        if (msg.sender != n.recipient) revert NotRecipient();

        // Acceptance predicate: when taskHash is set, redemption requires the bytes
        // whose keccak256 matches it. msg.sender authentication makes this a
        // receiver-bound bearer instrument; the same taskOutput cannot be racing
        // a competing redemption to a different address.
        if (n.taskHash != bytes32(0)) {
            if (keccak256(taskOutput) != n.taskHash) revert InvalidTaskOutput();
        }

        n.redeemed = true;
        if (!token.transfer(n.recipient, n.amount)) revert TokenTransferFailed();
        emit NoteRedeemed(noteId, n.recipient, n.amount);
    }

    /// @notice After expiry, the original issuer can pull the locked amount back
    ///         into their reserve balance. Mirrors the "expired note returns to
    ///         issuer" behaviour but on EVM the issuer must claim explicitly.
    function refundExpired(bytes32 noteId) external {
        Note storage n = notes[noteId];
        if (n.issuer == address(0)) revert NoteNotFound();
        if (n.redeemed) revert NoteAlreadyRedeemed();
        if (block.number < n.expiryBlock) revert NoteNotYetExpired();
        if (msg.sender != n.issuer) revert NotIssuer();

        n.redeemed = true;
        reserveBalance[n.issuer] += n.amount;
        emit NoteRefunded(noteId, n.issuer, n.amount);
    }

    // ────────────────────────────────────────────────────────────────
    // View helpers
    // ────────────────────────────────────────────────────────────────

    function getNote(bytes32 noteId) external view returns (Note memory) {
        return notes[noteId];
    }

    /// @notice Compute what the next noteId for `issuer` would be without issuing it.
    function previewNoteId(address issuer) external view returns (bytes32) {
        return keccak256(abi.encode(issuer, nonceOf[issuer], address(this)));
    }
}
