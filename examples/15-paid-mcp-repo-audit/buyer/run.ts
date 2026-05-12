// ─────────────────────────────────────────────────────────────────────────────
// Buyer — drives the demo end-to-end.
//
// 1. Build the Accord Agreement.
// 2. Persist it in the seller's agreement store.
// 3. "Pay" with a MockPayment whose value covers the agreement's price.
// 4. Call the seller's paywalled MCP tool.
// 5. Inspect the AccordMcpResult — output, _meta.accord_*, no isError.
// 6. Print a clean step-by-step trace to stdout.
//
// In a real deployment, the agreement store would be the seller's
// database; the buyer would receive an agreement-template URL via 402
// challenge or a /.well-known/accord lookup, build the Agreement
// client-side, and POST it to a Create-Agreement API. The demo collapses
// these into one process for clarity.
// ─────────────────────────────────────────────────────────────────────────────

import { buildDemoAgreement, agreementHash } from "../common/agreement.js";
import { InMemoryAgreementStore } from "../common/storage/agreement-store.js";
import { buildSeller } from "../seller/tool.js";
import { makeDemoVerifier } from "../verifier/sign.js";

export interface DemoTrace {
  agreement_id: string;
  agreement_hash: string;
  verification_receipt_id: string | undefined;
  settlement_receipt_id: string | undefined;
  output: unknown;
  ok: boolean;
  error_code?: string;
}

export async function runDemo(opts?: { repo_url?: string; agreement_id?: string }): Promise<DemoTrace> {
  const repo_url = opts?.repo_url ?? "https://github.com/accord-protocol/accord-protocol";

  // 1. Build the Accord Agreement.
  const agreement = buildDemoAgreement({ repo_url, agreement_id: opts?.agreement_id });

  // 2. Persist it where the seller's resolver can find it.
  const store = new InMemoryAgreementStore();
  store.put(agreement);

  // 3 + 4. Wire up the seller. Verifier is required (Agreement says so).
  const verifier = makeDemoVerifier();
  const { callTool } = buildSeller({ agreementStore: store, verifier });

  // 5. Make the paid call.
  const result = await callTool({
    accord_agreement_id: agreement.agreement_id,
    accord_payment: { value: agreement.price.amount },
    repo_url,
  } as never);

  // 6. Build a small structured trace for the CLI / tests.
  const trace: DemoTrace = {
    agreement_id: agreement.agreement_id,
    agreement_hash: agreementHash(agreement),
    verification_receipt_id: undefined,
    settlement_receipt_id: undefined,
    output: undefined,
    ok: !result.isError,
    error_code: result.isError ? String(result._meta.accord_error_code) : undefined,
  };

  if (!result.isError) {
    trace.output = result.output;
    trace.verification_receipt_id = result._meta.accord_verification_receipt?.receipt_id;
    trace.settlement_receipt_id = result._meta.accord_settlement_receipt?.settlement_id;
  }

  return trace;
}
