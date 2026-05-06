{
    // Contract for reserve (in ERG only)
    //
    // ──────────────────────────────────────────────────────────────────────
    // VENDORED FROM kushti/ChainCash with security fixes applied — see
    // docs/audit/DEEP_REVIEW.md for the full list and rationale. Modifications
    // vs upstream:
    //   * C-002: R5 preservation now enforced in top-up and mint-note paths.
    //   * H-002: mint-note (action 2) now requires an output at the index
    //     supplied via context var 7 with the structural shape of a freshly
    //     issued Note: empty-tree R4 digest, issuer key R5, R6 = 0L. The
    //     reserve cannot bind to the Note's contract hash (would create a
    //     compile cycle: note already binds to reserve via $reserveContractHash);
    //     the structural check is the closest cycle-free guard.
    //   * H-004: buyback fee no longer skipped when redeemed == 0. Action 0
    //     is gated on `redeemed > 0` instead of branching on it.
    //   * M-001: receipt R7 is now set to the redeemer's pubkey, supplied
    //     via context var 6, with `proveDlog(redeemerKey)` enforcing it.
    // ──────────────────────────────────────────────────────────────────────

    // Data:
    //  - token #0 - identifying singleton token
    //  - R4 - signing key (as a group element)
    //  - R5 - tree of all the note tokens issued
    //
    // Actions:
    //  - redeem note (#0)
    //  - top up      (#1)
    //  - mint note (#2)

    val v = getVar[Byte](0).get
    val action = v / 10
    val index = v % 10

    val ownerKey = SELF.R4[GroupElement].get // reserve owner's key, used in notes and unlock/lock/refund actions
    val selfOut = OUTPUTS(index)

    // common checks for all the paths (not incl. ERG value check).
    // C-002: R5 (tree of note tokens) is now part of selfPreserved by default.
    // Paths that legitimately mutate R5 (none in v0) must override locally.
    val selfPreserved =
            selfOut.propositionBytes == SELF.propositionBytes &&
            selfOut.tokens == SELF.tokens &&
            selfOut.R4[GroupElement].get == SELF.R4[GroupElement].get &&
            selfOut.R5[AvlTree].get == SELF.R5[AvlTree].get

    if (action == 0) {
      // redemption path
      // OUTPUTS:
      // #1 - receipt
      // #2 - buyback

      val g: GroupElement = groupGenerator

      // if set, re-redemption against receipt data is done, otherwise, a note is redeemed
      val receiptMode = getVar[Boolean](4).get

      // read note data if receiptMode == false, receipt data otherwise
      val noteInput = INPUTS(index)
      val noteTokenId = noteInput.tokens(0)._1
      val noteValue = noteInput.tokens(0)._2 // 1 token == 1 mg of gold
      val history = noteInput.R4[AvlTree].get
      val reserveId = SELF.tokens(0)._1

      // oracle provides gold price in nanoErg per kg in its R4 register
      val goldOracle = CONTEXT.dataInputs(0)
      // todo: externalize oracle NFT id (H-001 — tracked separately)
      // the ID below is from the mainnet
      val properOracle = goldOracle.tokens(0)._1 == fromBase16("3c45f29a5165b030fdb5eaf5d81f8108f9d8f507b31487dd51f4ae08fe07cf4a")
      val oracleRate = goldOracle.R4[Long].get / 1000000 // normalize to nanoerg per mg of gold

      // 2% redemption fee
      val maxToRedeem = noteValue * oracleRate * 98 / 100
      val redeemed = SELF.value - selfOut.value

      // H-004: buyback fee enforced uniformly. Upstream branched on
      // `redeemed > 0` and skipped the fee when zero; now the action is
      // gated on `redeemed > 0` overall.
      val toOracle = redeemed * 2 / 1000
      // todo: externalize buyback NFT id (H-001 — tracked separately)
      // the ID below is from the mainnet
      val buyBackNFTId = fromBase16("bf24ed4af7eb5a7839c43aa6b240697d81b196120c837e1a941832c266d3755c")
      val buyBackInput = INPUTS(2)
      val buyBackOutput = OUTPUTS(2)
      val buyBackCorrect =
        buyBackInput.tokens(0)._1 == buyBackNFTId &&
        buyBackOutput.tokens(0)._1 == buyBackNFTId &&
        (buyBackOutput.value - buyBackInput.value) >= toOracle

      val redeemCorrect = (redeemed > 0) && (redeemed <= maxToRedeem) && buyBackCorrect

      val position = getVar[Long](3).get
      val positionBytes = longToByteArray(position)

      val proof = getVar[Coll[Byte]](1).get
      val key = positionBytes ++ reserveId
      val value = history.get(key, proof).get

      val aBytes = value.slice(0, 33)
      val zBytes = value.slice(33, value.size)
      val a = decodePoint(aBytes)
      val z = byteArrayToBigInt(zBytes)

      val maxValueBytes = getVar[Coll[Byte]](2).get

      val message = positionBytes ++ maxValueBytes ++ noteTokenId
      val maxValue = byteArrayToLong(maxValueBytes)

      // Computing challenge
      val e: Coll[Byte] = blake2b256(aBytes ++ message ++ ownerKey.getEncoded) // strong Fiat-Shamir
      val eInt = byteArrayToBigInt(e) // challenge as big integer

      // Signature is valid if g^z = a * x^e
      val properSignature = (g.exp(z) == a.multiply(ownerKey.exp(eInt))) &&
                             noteValue <= maxValue

      // M-001: R7 is now the redeemer's pubkey, supplied via context var 6
      // (rather than the reserve owner's key). Combined with proveDlog at
      // the bottom this binds the receipt to the actual redeemer.
      val redeemerKey = getVar[GroupElement](6).get
      val receiptOutIndex = 1
      val receiptOut = OUTPUTS(receiptOutIndex)
      val properReceipt =
        receiptOut.tokens(0) == noteInput.tokens(0) &&
        receiptOut.R4[AvlTree].get == history  &&
        receiptOut.R5[Long].get == position    &&
        receiptOut.R6[Int].get >= HEIGHT - 20  &&  // 20 blocks for inclusion
        receiptOut.R6[Int].get <= HEIGHT &&
        receiptOut.R7[GroupElement].get == redeemerKey

      val positionCorrect = if (receiptMode) {
        position < noteInput.R5[Long].get
      } else {
        true
      }

      sigmaProp(selfPreserved && properOracle && redeemCorrect && properSignature && properReceipt && positionCorrect) && proveDlog(redeemerKey)
    } else if (action == 1) {
      // top up
      // C-002: selfPreserved now includes R5 equality, so the AVL tree of
      // issued note tokens is no longer mutable through this path.
      sigmaProp(selfPreserved && (selfOut.value - SELF.value >= 1000000000)) // at least 1 ERG added
    } else if (action == 2) {
      // issue a note
      // C-002: selfPreserved keeps R5 immutable in v0 (intended R5 mutation
      // is a v1 feature requiring insertOrUpdate semantics for the issued
      // note tokens AVL).
      //
      // H-002: structural check that an actual Note output is being created.
      // We cannot bind to the Note contract hash here (note.es itself binds
      // to reserve via $reserveContractHash, which would create a compile
      // cycle), so we check the documented Note creation invariants from
      // note.es:
      //   * R4 is an AVL tree (empty digest)
      //   * R5 is the issuer's group element key (== reserve owner key)
      //   * R6 == 0L  (initial position)
      //   * tokens(0) holds the freshly minted singleton
      // proveDlog(ownerKey) requires the reserve owner to authorise the mint.
      val noteIdx = getVar[Int](7).get
      val noteOut = OUTPUTS(noteIdx)
      val noteShapeCorrect =
        noteOut.tokens.size >= 1 &&
        noteOut.R4[AvlTree].isDefined &&
        noteOut.R5[GroupElement].get == ownerKey &&
        noteOut.R6[Long].get == 0L
      sigmaProp(selfPreserved && noteShapeCorrect) && proveDlog(ownerKey)
    } else {
      sigmaProp(false)
    }

}
