// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/gateway — Connect/Express middleware factory
//
// Wraps an HTTP endpoint with the Accord/402 paywall. Per request:
//
//   1. Read X-Accord-* headers (defaults: agreement-id, payment, task-output).
//      No Accord headers → respond 402 with the agreement template.
//   2. Resolve agreement-id. Unknown → 402 with template.
//   3. validateAgreement(agreement). Bad → 400 ACCORD_AGREEMENT_INVALID.
//   4. Decode payment header (JSON-encoded; the rail decides what's inside).
//      Missing → 402.
//   5. rail.verifyPayment(...). Reject → 402 PAYMENT_VERIFICATION_FAILED.
//      Throws → 502 RAIL_UNAVAILABLE.
//   6. Replay-store check: paymentId already claimed → 402 REPLAY_DETECTED.
//      First time → put(paymentId, deadline).
//   7. (Optional) Pre-committed task-output check.
//   8. Run the seller's handler. Throws → 500 HANDLER_THREW.
//   9. (If required) Call verifier; reject → 422 VERIFICATION_REJECTED.
//  10. (Optional) rail.settle(...). Failure does NOT reject; logged in meta.
//  11. Respond 200 with the handler's return value (JSON) plus Accord
//      response headers carrying the agreement-hash + receipt hashes.
//
// The middleware does not depend on Express types — it talks to the
// minimal AccordHttpRequest / AccordHttpResponse shapes from types.ts.
// Drop it in front of any Connect-style framework.
// ─────────────────────────────────────────────────────────────────────────────

import {
  accordHashV0,
  validateAgreement,
  validateVerificationReceipt,
  type AccordAgreement,
  type AccordSettlementReceipt,
  type AccordVerificationReceipt,
} from "@accord-protocol/core";

import { ACCORD_GATEWAY_ERROR_CODES } from "./errors.js";
import { InMemoryReplayStore } from "./replay.js";
import {
  ACCORD_HEADERS,
  type AccordGatewayConfig,
  type AccordHttpRequest,
  type AccordHttpResponse,
  type AccordMiddleware,
  type NextFn,
  type AgreementTemplate,
  type AccordReplayStore,
} from "./types.js";

const DEFAULT_REPLAY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function accordGateway<TBody = unknown, TOut = unknown>(
  config: AccordGatewayConfig<TBody, TOut>,
): AccordMiddleware {
  const replayStore: AccordReplayStore = config.replayStore ?? new InMemoryReplayStore();

  return async function handle(req, res, next) {
    try {
      // ── 1. Pull headers ────────────────────────────────────────────────
      const agreementId = headerOf(req, ACCORD_HEADERS.agreementId);
      const paymentRaw = headerOf(req, ACCORD_HEADERS.payment);
      const taskOutputRaw = headerOf(req, ACCORD_HEADERS.taskOutput);

      if (!agreementId) {
        return respond402(res, config.buildAgreementTemplate(req), {
          code: ACCORD_GATEWAY_ERROR_CODES.ACCORD_PAYMENT_REQUIRED,
          message: "Accord agreement-id required. Construct an Agreement and retry.",
        });
      }

      // ── 2. Resolve the Agreement ───────────────────────────────────────
      let agreement: AccordAgreement | undefined;
      try {
        agreement = await config.resolveAgreement(agreementId);
      } catch (err) {
        return respond402(res, config.buildAgreementTemplate(req), {
          code: ACCORD_GATEWAY_ERROR_CODES.UNKNOWN_AGREEMENT,
          message: `resolveAgreement threw: ${stringifyError(err)}`,
          accord_agreement_id: agreementId,
        });
      }
      if (!agreement) {
        return respond402(res, config.buildAgreementTemplate(req), {
          code: ACCORD_GATEWAY_ERROR_CODES.UNKNOWN_AGREEMENT,
          message: `no agreement found for id ${agreementId}`,
          accord_agreement_id: agreementId,
        });
      }

      // ── 3. validateAgreement ───────────────────────────────────────────
      const v = validateAgreement(agreement);
      if (!v.ok) {
        return respondJson(res, 400, {
          error: ACCORD_GATEWAY_ERROR_CODES.AGREEMENT_INVALID,
          accord_agreement_id: agreementId,
          problems: v.problems,
        });
      }

      // ── 4. Decode payment ──────────────────────────────────────────────
      if (!paymentRaw) {
        return respond402(res, config.buildAgreementTemplate(req), {
          code: ACCORD_GATEWAY_ERROR_CODES.MISSING_PAYMENT,
          message: `agreement ${agreementId} resolved but X-Accord-Payment is missing`,
          accord_agreement_id: agreementId,
        });
      }
      let payment: unknown;
      try {
        payment = JSON.parse(paymentRaw);
      } catch {
        // Some rails will send opaque hex / base64. If JSON fails, hand the
        // raw string to the rail and let it decide.
        payment = paymentRaw;
      }

      // ── 5. Rail-side payment verification ──────────────────────────────
      let verification:
        | {
            ok: true;
            rail: string;
            payment_id: string;
            details?: Record<string, unknown>;
          }
        | { ok: false; rail: string; code: string; message: string };
      try {
        verification = await config.rail.verifyPayment({ agreement, payment });
      } catch (err) {
        return respondJson(res, 502, {
          error: ACCORD_GATEWAY_ERROR_CODES.RAIL_UNAVAILABLE,
          rail: config.rail.rail,
          accord_agreement_id: agreementId,
          message: `rail.verifyPayment threw: ${stringifyError(err)}`,
        });
      }
      if (!verification.ok) {
        return respondJson(res, 402, {
          error: ACCORD_GATEWAY_ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
          rail: verification.rail,
          rail_error_code: verification.code,
          accord_agreement_id: agreementId,
          message: verification.message,
        });
      }

      // ── 6. Replay protection ───────────────────────────────────────────
      const replayKey = verification.payment_id;
      if (await replayStore.has(verification.rail, replayKey)) {
        return respondJson(res, 402, {
          error: ACCORD_GATEWAY_ERROR_CODES.REPLAY_DETECTED,
          rail: verification.rail,
          accord_agreement_id: agreementId,
          message: `payment_id was already claimed in the past TTL window`,
        });
      }
      await replayStore.put(
        verification.rail,
        replayKey,
        Date.now() + DEFAULT_REPLAY_TTL_MS,
      );

      // ── 7. Optional pre-committed task-output check ────────────────────
      if (taskOutputRaw && agreement.task.output_hash) {
        const got = "blake2b256:0x" + accordHashV0(taskOutputRaw);
        if (got !== agreement.task.output_hash) {
          return respondJson(res, 400, {
            error: ACCORD_GATEWAY_ERROR_CODES.TASK_OUTPUT_HASH_MISMATCH,
            accord_agreement_id: agreementId,
            message: `accord_task_output hash ${got} ≠ agreement.task.output_hash ${agreement.task.output_hash}`,
          });
        }
      }

      // ── 8. Run the seller's handler ────────────────────────────────────
      let output: TOut | void;
      try {
        output = await config.handler(req, {
          agreement,
          body: req.body as TBody,
        });
      } catch (err) {
        return respondJson(res, 500, {
          error: ACCORD_GATEWAY_ERROR_CODES.HANDLER_THREW,
          accord_agreement_id: agreementId,
          message: stringifyError(err),
        });
      }

      // ── 9. Optional verifier ───────────────────────────────────────────
      let verificationReceipt: AccordVerificationReceipt | undefined;
      if (agreement.verification.required) {
        if (!config.verifier) {
          return respondJson(res, 422, {
            error: ACCORD_GATEWAY_ERROR_CODES.VERIFICATION_REQUIRED,
            accord_agreement_id: agreementId,
            message:
              "agreement.verification.required is true but no verifier is configured on the gateway",
          });
        }
        try {
          verificationReceipt = await config.verifier({
            agreement,
            output,
          });
        } catch (err) {
          return respondJson(res, 422, {
            error: ACCORD_GATEWAY_ERROR_CODES.VERIFICATION_REJECTED,
            accord_agreement_id: agreementId,
            message: `verifier threw: ${stringifyError(err)}`,
          });
        }
        const vr = validateVerificationReceipt(verificationReceipt, { agreement });
        if (!vr.ok || verificationReceipt.result === "rejected") {
          return respondJson(res, 422, {
            error: ACCORD_GATEWAY_ERROR_CODES.VERIFICATION_REJECTED,
            accord_agreement_id: agreementId,
            message:
              verificationReceipt.result === "rejected"
                ? "verifier rejected the seller's output"
                : `verification receipt is invalid: ${vr.problems.map((p) => p.code).join(", ")}`,
            problems: vr.ok ? undefined : vr.problems,
          });
        }
      }

      // ── 10. Best-effort settle ─────────────────────────────────────────
      let settlementReceipt: AccordSettlementReceipt | undefined;
      if (config.rail.settle) {
        try {
          settlementReceipt = await config.rail.settle({
            agreement,
            payment,
            verification: verificationReceipt,
          });
        } catch {
          // Logged in the response meta; not a hard failure.
          settlementReceipt = undefined;
        }
      }

      // ── 11. Respond 200 ─────────────────────────────────────────────────
      const agreementHash = "blake2b256:0x" + accordHashV0(agreement);
      res.setHeader(ACCORD_HEADERS.versionResponse, "v0");
      res.setHeader(
        "x-accord-agreement-hash",
        agreementHash,
      );
      if (verificationReceipt) {
        res.setHeader(
          "x-accord-verification-receipt-hash",
          "blake2b256:0x" + accordHashV0(verificationReceipt),
        );
      }
      if (settlementReceipt) {
        res.setHeader(
          "x-accord-settlement-receipt-hash",
          "blake2b256:0x" + accordHashV0(settlementReceipt),
        );
      }

      // If the handler returned a value, emit it as JSON. If it returned
      // undefined, assume the handler took over the response itself
      // (streaming, custom content type, etc.).
      if (output !== undefined) {
        respondJson(res, 200, {
          output,
          _meta: {
            accord_agreement_id: agreementId,
            accord_agreement_hash: agreementHash,
            accord_verification_receipt: verificationReceipt,
            accord_settlement_receipt: settlementReceipt,
            accord_settlement_attempted: !!config.rail.settle,
          },
        });
      }
    } catch (err) {
      // Defensive — anything else propagates to the framework's error handler.
      next(err);
    }
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function headerOf(req: AccordHttpRequest, name: string): string | undefined {
  // HTTP headers are case-insensitive; downstream frameworks normalise to
  // lower-case, but we accept either.
  const lower = name.toLowerCase();
  for (const k of Object.keys(req.headers)) {
    if (k.toLowerCase() === lower) {
      const v = req.headers[k];
      if (v == null) return undefined;
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function respond402(
  res: AccordHttpResponse,
  template: AgreementTemplate,
  body: { code: string; message: string; accord_agreement_id?: string },
): void {
  res.statusCode = 402;
  res.setHeader(ACCORD_HEADERS.versionResponse, "v0");
  res.setHeader(ACCORD_HEADERS.agreementRequired, "true");
  res.setHeader(ACCORD_HEADERS.agreementTemplate, template.agreement_template);
  res.setHeader(ACCORD_HEADERS.acceptedRails, template.accepted_rails.join(","));
  res.setHeader(ACCORD_HEADERS.wwwAuthenticate, "Accord402");
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      error: body.code,
      message: body.message,
      accord_agreement_id: body.accord_agreement_id,
      ...template,
    }),
  );
}

function respondJson(
  res: AccordHttpResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
