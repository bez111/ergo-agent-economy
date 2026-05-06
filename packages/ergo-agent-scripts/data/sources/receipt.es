{
    // receipt contract
    //
    // ──────────────────────────────────────────────────────────────────────
    // VENDORED FROM kushti/ChainCash. Modifications vs upstream — see
    // docs/audit/DEEP_REVIEW.md:
    //   * M-001: comment now matches reserve.es. R7 is the redeemer's PK
    //     (supplied to reserve.es via context var 6 and enforced there with
    //     proveDlog). Re-redemption uses proveDlog(R7) below — the redeemer
    //     keeps the right to claim more value against another reserve.
    // ──────────────────────────────────────────────────────────────────────
    //
    // it is possible to spend this box 3 years after, with tokens being necessarily burnt
    // it protects from storage rent taking tokens

    // registers:
    // R4 - AvlTree - history of ownership for corresponding redeemed note
    // R5 - Long - redeemed position
    // R6 - approx. height when this box was created
    // R7 - redeemer PK (group element)

    def noTokens(b: Box) = b.tokens.size == 0
    val noTokensInOutputs = OUTPUTS.forall(noTokens)

    val creationHeight = SELF.R6[Int].get
    val burnPeriod = 788400 // 3 years

    val burnDone = (HEIGHT > creationHeight + burnPeriod) && noTokensInOutputs

    // we check that the receipt is spent along with a reserve contract box.
    // for that, we fix reserve input position @ #1
    // we drop version byte during ergotrees comparison
    // signature of receipt holder is also required
    val reserveInputErgoTree = INPUTS(1).propositionBytes
    val treeHash = blake2b256(reserveInputErgoTree.slice(1, reserveInputErgoTree.size))
    val reserveSpent = treeHash == fromBase58("$reserveContractHash")

    // we check receipt contract here, and other fields in reserve contract, see comments in reserve.es
    val receiptOutputErgoTree = OUTPUTS(1).propositionBytes
    val receiptCreated = receiptOutputErgoTree == SELF.propositionBytes
    val reRedemption = proveDlog(SELF.R7[GroupElement].get) && sigmaProp(reserveSpent && receiptCreated)

    burnDone || reRedemption
}
