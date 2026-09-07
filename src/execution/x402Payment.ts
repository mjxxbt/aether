import { PendingAction, SizedOpportunity } from "../types";
import { SNAPSHOT_TTL_MS } from "../context";
import { withStateLock } from "../config/transaction";
import { createPendingAction, listAllActions } from "./confirmationGate";
import { buildExecutionInstruction } from "./executionRouter";

export interface PaymentInstruction {
  route: "x402";
  endpoint: string;
  currency: string;
  amountUsd: number;
  paymentHeader: string; // placeholder — the agent fills this from its wallet state
  note: string;
}

export interface X402PaymentRequest {
  signalDescription: string;
  endpoint: string;
  currency: string;
  amountUsd: number;
  targetStrategy: string;
}

export interface PaymentContext {
  source: "agent_os_wallet";
  executionMode: "live" | "paper";
  capturedAt: string;
  walletAvailableUsd: number;
}

function validatePaymentRequest(req: X402PaymentRequest): void {
  if (!req || typeof req !== "object") throw new Error("x402 payment request is required.");
  if (typeof req.signalDescription !== "string" || req.signalDescription.trim().length === 0) {
    throw new Error("x402 signalDescription is required.");
  }
  if (typeof req.endpoint !== "string" || req.endpoint.trim().length === 0) {
    throw new Error("x402 endpoint is required.");
  }
  try {
    const url = new URL(req.endpoint);
    if (url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new Error("x402 endpoint must be a valid HTTPS URL.");
  }
  if (typeof req.currency !== "string" || !/^[A-Za-z0-9]{2,12}$/.test(req.currency)) {
    throw new Error("x402 currency must be a 2–12 character asset code.");
  }
  if (!Number.isFinite(req.amountUsd) || req.amountUsd <= 0) {
    throw new Error("x402 amountUsd must be a finite amount greater than zero.");
  }
  if (typeof req.targetStrategy !== "string" || req.targetStrategy.trim().length === 0) {
    throw new Error("x402 targetStrategy is required.");
  }
}

function paymentToOpportunity(req: X402PaymentRequest): SizedOpportunity {
  return {
    strategy: "convert_yield", // closest existing bucket; x402 isn't a trade strategy
    symbol: req.currency,
    direction: "buy",
    venue: "spot",
    confidence: 1, // payments are either approved or not — no confidence needed
    rationale:
      `x402 micropayment of $${req.amountUsd} ${req.currency} to ${req.endpoint} ` +
      `for premium signal: "${req.signalDescription}". ` +
      `Signal will be used by the ${req.targetStrategy} strategy. ` +
      `This is NOT a trade — it is a payment authorization. `,
    suggestedSizeUsd: req.amountUsd,
    approved: true,
    finalSizeUsd: req.amountUsd,
    riskNotes: [`x402 payment: $${req.amountUsd} ${req.currency} to ${req.endpoint}`],
    raw: {
      type: "x402_payment",
      endpoint: req.endpoint,
      currency: req.currency,
      amountUsd: req.amountUsd,
      targetStrategy: req.targetStrategy,
    },
  };
}

export function proposePayment(req: X402PaymentRequest, logPath?: string, context?: PaymentContext): PendingAction {
  validatePaymentRequest(req);
  const opp = paymentToOpportunity(req);
  if (context) {
    const captured = Date.parse(context.capturedAt);
    if (
      context.source !== "agent_os_wallet" ||
      !Number.isFinite(captured) ||
      captured > Date.now() + 60_000 ||
      Date.now() - captured >= SNAPSHOT_TTL_MS ||
      !Number.isFinite(context.walletAvailableUsd) ||
      context.walletAvailableUsd < req.amountUsd
    ) {
      throw new Error("x402 requires a fresh Agent OS wallet attestation and sufficient available balance.");
    }
    opp.raw = { ...opp.raw, paymentContext: context };
  }
  return withStateLock(() =>
    createPendingAction(opp, logPath, context?.executionMode ?? "paper", context ? "mcp_live" : "demo"),
  );
}

export function confirmPayment(actionId: string, logPath?: string): PaymentInstruction {
  return withStateLock(() => {
    const existing = listAllActions(logPath).find((candidate) => candidate.id === actionId);
    if (!existing) throw new Error(`No pending action found with id ${actionId}`);
    if (existing.executionMode !== "live" || existing.executionContext !== "mcp_live") {
      throw new Error(
        `Payment ${actionId} is not from a confirmed live Agent OS context; demo and paper payments are blocked.`,
      );
    }
    if (existing.opportunity.raw?.type !== "x402_payment") throw new Error("Action is not an x402 payment.");
    // Dashboard confirmation has already happened. Never confirm twice.
    buildExecutionInstruction(existing);
    const action = existing;
    const raw = action.opportunity.raw as {
      endpoint: string;
      currency: string;
      amountUsd: number;
    };
    return {
      route: "x402",
      endpoint: raw.endpoint,
      currency: raw.currency,
      amountUsd: raw.amountUsd,
      paymentHeader: "<agent fills from Agentic Wallet balance>",
      note:
        "Call the Skills Hub endpoint with the X-PAYMENT header value " +
        "derived from the Agentic Wallet. Verify the signal response before " +
        "passing it to the target strategy as a StrategyInput update.",
    };
  });
}
