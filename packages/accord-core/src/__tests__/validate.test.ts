import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgreement,
  validateVerificationReceipt,
  validateSettlementReceipt,
  compareDecimal,
} from "../validate.js";
import { accordHashV0 } from "../hash.js";
import type {
  AccordAgreement,
  AccordVerificationReceipt,
  AccordSettlementReceipt,
} from "../types.js";

function minimalAgreement(): AccordAgreement {
  return {
    type: "accord.agreement.v0",
    version: "v0",
    agreement_id: "acc_01HX0000000000000000000000",
    created_at: "2026-05-07T00:00:00Z",
    buyer: { id: "agent://buyer" },
    seller: { id: "provider://seller" },
    task: { kind: "x", input_ref: "inline:hi", description: "x" },
    price: { amount: "25", currency: "ERG", decimals: 9 },
    payment: {
      mode: "note",
      rail: "ergo",
      reserve_ref: "ergo:box:abc",
      deadline: "+480 blocks",
    },
    verification: { required: false, method: "none" },
    settlement: { mode: "inline", refund_policy: "expiry", dispute_policy: "none" },
  };
}

function minimalVReceipt(agreement_hash: string): AccordVerificationReceipt {
  return {
    type: "accord.verification_receipt.v0",
    version: "v0",
    receipt_id: "vr_01HX0000000000000000000000",
    agreement_id: "acc_01HX0000000000000000000000",
    agreement_hash,
    verifier: { id: "verifier://security-v0" },
    result: "accepted",
    evidence: {
      output_hash: "blake2b256:0x" + "1".repeat(64),
    },
    created_at: "2026-05-07T00:00:10Z",
    signature: {
      scheme: "ed25519",
      public_key: "0xdead",
      signature: "0xbeef",
    },
  };
}

function minimalSReceipt(agreement_hash: string): AccordSettlementReceipt {
  return {
    type: "accord.settlement_receipt.v0",
    version: "v0",
    settlement_id: "sr_01HX0000000000000000000000",
    agreement_id: "acc_01HX0000000000000000000000",
    agreement_hash,
    rail: "ergo",
    mode: "note_redeemed",
    status: "settled",
    amount: "25",
    currency: "ERG",
    decimals: 9,
    tx: {
      network: "testnet",
      tx_id: "0x" + "a".repeat(64),
      box_id: "0x" + "b".repeat(64),
    },
    created_at: "2026-05-07T00:00:20Z",
  };
}

function agreementHash(agreement: AccordAgreement): string {
  return "blake2b256:0x" + accordHashV0(agreement);
}

describe("validateAgreement", () => {
  it("accepts a minimal valid agreement", () => {
    const r = validateAgreement(minimalAgreement());
    assert.equal(r.ok, true);
    assert.equal(r.problems.length, 0);
  });

  it("rejects a non-UTC timestamp", () => {
    const ag = minimalAgreement();
    ag.created_at = "2026-05-07T00:00:00+05:00";
    const r = validateAgreement(ag);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_INVALID_TIMESTAMP");
  });

  it("rejects payment.mode=note without reserve_ref", () => {
    const ag = minimalAgreement();
    delete ag.payment.reserve_ref;
    const r = validateAgreement(ag);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.path === "$.payment.reserve_ref"));
  });

  it("rejects verification.method=verifier_receipt without verifier", () => {
    const ag = minimalAgreement();
    ag.verification = { required: true, method: "verifier_receipt" };
    const r = validateAgreement(ag);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.path === "$.verification.verifier"));
  });

  it("rejects an absolute deadline that isn't ISO-8601 UTC", () => {
    const ag = minimalAgreement();
    ag.payment.deadline = "next Tuesday";
    const r = validateAgreement(ag);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_INVALID_DEADLINE");
  });

  it("rejects top-level keys that start with `accord_`", () => {
    const ag = minimalAgreement() as unknown as Record<string, unknown>;
    ag["accord_secret"] = "shh";
    const r = validateAgreement(ag as unknown as AccordAgreement);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_UNKNOWN_CRITICAL_EXTENSION"));
  });
});

describe("validateVerificationReceipt", () => {
  const hash = "blake2b256:0x" + "0".repeat(64);

  it("accepts a minimal accepted receipt", () => {
    const r = validateVerificationReceipt(minimalVReceipt(hash));
    assert.equal(r.ok, true);
  });

  it("rejects an agreement_hash with a non-Accord hash prefix", () => {
    const v = minimalVReceipt("sha256:0x" + "0".repeat(64));
    const r = validateVerificationReceipt(v);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.path === "$.agreement_hash"));
  });

  it("rejects result=accepted while a check has result=fail", () => {
    const v = minimalVReceipt(hash);
    v.checks = [{ name: "schema_valid", result: "fail" }];
    const r = validateVerificationReceipt(v);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_RESULT_INCONSISTENT");
  });

  it("rejects result=rejected without a failed check or detail", () => {
    const v = minimalVReceipt(hash);
    v.result = "rejected";
    const r = validateVerificationReceipt(v);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_RESULT_INCONSISTENT");
  });

  it("rejects mismatched verifier vs agreement", () => {
    const ag = minimalAgreement();
    ag.verification = {
      required: true,
      method: "verifier_receipt",
      verifier: "verifier://different",
    };
    const v = minimalVReceipt(agreementHash(ag));
    const r = validateVerificationReceipt(v, { agreement: ag });
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_VERIFIER_MISMATCH");
  });

  it("accepts a receipt bound to the resolved agreement id and hash", () => {
    const ag = minimalAgreement();
    const v = minimalVReceipt(agreementHash(ag));
    v.agreement_id = ag.agreement_id;
    const r = validateVerificationReceipt(v, { agreement: ag });
    assert.equal(r.ok, true);
  });

  it("rejects a receipt bound to a different agreement_id", () => {
    const ag = minimalAgreement();
    const v = minimalVReceipt(agreementHash(ag));
    v.agreement_id = "acc_01HX0DIFFERENTAGREEMENTID";
    const r = validateVerificationReceipt(v, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some((p) => p.code === "ACCORD_AGREEMENT_MISMATCH"),
    );
  });

  it("rejects an agreement_hash that does not match the resolved agreement", () => {
    const ag = minimalAgreement();
    const v = minimalVReceipt("blake2b256:0x" + "0".repeat(64));
    const r = validateVerificationReceipt(v, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_HASH_MISMATCH"));
  });

  it("rejects when evidence_required is missing from checks", () => {
    const ag = minimalAgreement();
    ag.verification = {
      required: true,
      method: "verifier_receipt",
      verifier: "verifier://security-v0",
      evidence_required: ["schema_valid", "tests_green"],
    };
    const v = minimalVReceipt(hash);
    v.checks = [{ name: "schema_valid", result: "pass" }];
    const r = validateVerificationReceipt(v, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some(
        (p) => p.code === "ACCORD_EVIDENCE_MISSING" && p.message.includes("tests_green"),
      ),
    );
  });

  it("rejects top-level keys that start with `accord_`", () => {
    const v = minimalVReceipt(hash) as unknown as Record<string, unknown>;
    v["accord_future"] = true;
    const r = validateVerificationReceipt(v as unknown as AccordVerificationReceipt);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_UNKNOWN_CRITICAL_EXTENSION"));
  });
});

describe("validateSettlementReceipt", () => {
  const hash = "blake2b256:0x" + "0".repeat(64);

  it("accepts a minimal Ergo note_redeemed receipt", () => {
    const r = validateSettlementReceipt(minimalSReceipt(hash));
    assert.equal(r.ok, true);
  });

  it("rejects an agreement_hash with a non-Accord hash prefix", () => {
    const s = minimalSReceipt("sha256:0x" + "0".repeat(64));
    const r = validateSettlementReceipt(s);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.path === "$.agreement_hash"));
  });

  it("rejects mode 'redeemed' under rail 'ergo'", () => {
    const s = minimalSReceipt(hash);
    s.mode = "redeemed";
    const r = validateSettlementReceipt(s);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0]?.code, "ACCORD_MODE_INVALID_FOR_RAIL");
  });

  it("rejects Ergo settlement without box_id", () => {
    const s = minimalSReceipt(hash);
    delete s.tx.box_id;
    const r = validateSettlementReceipt(s);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_TX_FORMAT_INVALID"));
  });

  it("rejects status=settled when verification was required but receipts is empty", () => {
    const ag = minimalAgreement();
    ag.verification = {
      required: true,
      method: "verifier_receipt",
      verifier: "verifier://security-v0",
    };
    const s = minimalSReceipt(hash);
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some((p) => p.code === "ACCORD_VERIFICATION_REQUIRED"),
    );
  });

  it("rejects amount that exceeds the agreement price", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt(agreementHash(ag));
    s.amount = "26"; // agreement price is "25"
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some((p) => p.code === "ACCORD_AMOUNT_EXCEEDS_AGREEMENT"),
    );
  });

  it("accepts a receipt bound to the resolved agreement context", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt(agreementHash(ag));
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, true);
  });

  it("rejects a receipt bound to a different agreement_id", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt(agreementHash(ag));
    s.agreement_id = "acc_01HX0DIFFERENTAGREEMENTID";
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some((p) => p.code === "ACCORD_AGREEMENT_MISMATCH"),
    );
  });

  it("rejects an agreement_hash that does not match the resolved agreement", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt("blake2b256:0x" + "0".repeat(64));
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_HASH_MISMATCH"));
  });

  it("rejects a settlement receipt whose rail differs from the agreement", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt(agreementHash(ag));
    s.rail = "x402";
    s.mode = "paid_before_response";
    delete s.tx.box_id;
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_RAIL_MISMATCH"));
  });

  it("rejects a settlement receipt whose currency or decimals differ from the agreement", () => {
    const ag = minimalAgreement();
    const s = minimalSReceipt(agreementHash(ag));
    s.currency = "USDC";
    s.decimals = 6;
    const r = validateSettlementReceipt(s, { agreement: ag });
    assert.equal(r.ok, false);
    assert.ok(
      r.problems.some((p) => p.code === "ACCORD_CURRENCY_MISMATCH"),
    );
  });

  it("rejects top-level keys that start with `accord_`", () => {
    const s = minimalSReceipt(hash) as unknown as Record<string, unknown>;
    s["accord_future"] = true;
    const r = validateSettlementReceipt(s as unknown as AccordSettlementReceipt);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.code === "ACCORD_UNKNOWN_CRITICAL_EXTENSION"));
  });
});

describe("compareDecimal", () => {
  it("compares integer parts correctly", () => {
    assert.equal(compareDecimal("9", "10"), -1);
    assert.equal(compareDecimal("10", "9"), 1);
    assert.equal(compareDecimal("10", "10"), 0);
  });

  it("compares fractional parts correctly", () => {
    assert.equal(compareDecimal("1.5", "1.51"), -1);
    assert.equal(compareDecimal("1.50", "1.5"), 0); // trailing zeros are equal
    assert.equal(compareDecimal("0.001", "0.0009"), 1);
  });

  it("compares mixed integer/fraction inputs", () => {
    assert.equal(compareDecimal("25", "25.0"), 0);
    assert.equal(compareDecimal("25", "25.5"), -1);
  });
});
