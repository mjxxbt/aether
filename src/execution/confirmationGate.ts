import * as fs from "fs";
import { randomUUID } from "crypto";
import { ExecutionContext, PendingAction, SizedOpportunity } from "../types";

import { PATHS } from "../config/paths";
import { writeJsonAtomic } from "../config/persistence";
const DEFAULT_LOG_PATH = PATHS.PENDING_ACTIONS;
/** Short-lived approvals prevent an old price and balance snapshot being used. */
export const ACTION_TTL_MS = 30 * 60 * 1000;

function loadLog(logPath: string): PendingAction[] {
  if (!fs.existsSync(logPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8"));
  if (!Array.isArray(parsed)) throw new Error(`Pending action log is not an array: ${logPath}`);

  let changed = false;
  const log = parsed.map((raw) => {
    const action = raw as PendingAction;
    // Records created before executionMode existed are deliberately treated as
    // paper. Re-proposing is required before any write-capable tool can run.
    if (!action.executionMode) {
      action.executionMode = "paper";
      changed = true;
    }
    if (!action.executionContext) {
      // A legacy record has no proof that its data came from the MCP account.
      // Treat it as demo until a fresh MCP scan creates a new approval.
      action.executionContext = "demo";
      changed = true;
    }
    const createdAt = Date.parse(action.createdAt);
    const expiresAt =
      action.expiresAt ?? (Number.isFinite(createdAt) ? new Date(createdAt + ACTION_TTL_MS).toISOString() : undefined);
    if (!action.expiresAt && expiresAt) {
      action.expiresAt = expiresAt;
      changed = true;
    }
    const migratedSummary = buildSummary(action.opportunity, action.executionMode, action.executionContext);
    if (action.summary !== migratedSummary) {
      action.summary = migratedSummary;
      changed = true;
    }
    if (
      (action.status === "pending" || action.status === "confirmed") &&
      (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
    ) {
      action.status = "expired";
      changed = true;
    }
    return action;
  });

  if (changed) saveLog(logPath, log);
  return log;
}

function saveLog(logPath: string, log: PendingAction[]): void {
  writeJsonAtomic(logPath, log);
}

function dataContextLabel(opp: SizedOpportunity, executionContext: ExecutionContext): string {
  if (executionContext === "demo") return "DEMO / PUBLIC / SCENARIO";
  if (opp.signalContext === "demo") return "MCP ACCOUNT / DEMO SIGNAL";
  if (opp.raw?.type === "x402_payment" || opp.strategy === "prediction_market" || opp.venue === "onchain") {
    return "LIVE AGENT OS WALLET / SKILLS";
  }
  return "BINANCE MCP ACCOUNT";
}

function buildSummary(
  opp: SizedOpportunity,
  executionMode: "live" | "paper",
  executionContext: ExecutionContext,
): string {
  const lines = [
    `PROPOSED ACTION — requires your confirmation`,
    `Data context: ${dataContextLabel(opp, executionContext)}`,
    `Execution mode: ${executionMode.toUpperCase()}${executionMode === "paper" ? " — no live write is permitted" : ""}`,
    ...(opp.signalContext === "demo"
      ? ["Signal context: DEMO ADAPTER — paper-only; no external signal source was supplied."]
      : []),
    `Strategy: ${opp.strategy}`,
    `Symbol: ${opp.symbol} (${opp.venue})`,
    `Direction: ${opp.direction}`,
    `Size: $${opp.finalSizeUsd.toFixed(2)}`,
    `Confidence: ${(opp.confidence * 100).toFixed(1)}%`,
    `Why: ${opp.rationale}`,
  ];

  // Phase 1.3: paired leg disclosure
  if (opp.pairedLeg) {
    lines.push(`--- Hedge leg (same confirmation) ---`);
    lines.push(`Symbol: ${opp.pairedLeg.symbol} (${opp.pairedLeg.venue})`);
    lines.push(`Direction: ${opp.pairedLeg.direction}`);
    lines.push(`Size: $${opp.pairedLeg.sizeUsd.toFixed(2)}`);
    lines.push(`Why: ${opp.pairedLeg.rationale}`);
    lines.push(`--- Both legs share one approval, but execution is two external calls and is not exchange-atomic ---`);
  }

  if (opp.riskNotes.length) {
    lines.push(`Risk adjustments: ${opp.riskNotes.join(" ")}`);
  }

  if (opp.referencePriceUsd && opp.referencePriceUsd > 0) {
    const entrySide = opp.direction === "long" || opp.direction === "buy" ? "BUY" : "SELL";
    const isSpotExit = opp.venue === "spot" && entrySide === "SELL";
    lines.push(`Entry: ${entrySide} MARKET ${opp.symbol} · reference $${opp.referencePriceUsd.toFixed(8)}`);
    if (isSpotExit) {
      lines.push("Protection: not attached — this is a spot exit/rebalance, not a new short entry.");
    } else if (opp.stopPricePct !== undefined) {
      const stopPct = opp.stopPricePct;
      const takeProfitPct = opp.takeProfitPct ?? stopPct * 2;
      const stopPrice =
        entrySide === "BUY" ? opp.referencePriceUsd * (1 - stopPct) : opp.referencePriceUsd * (1 + stopPct);
      const takeProfitPrice =
        entrySide === "BUY" ? opp.referencePriceUsd * (1 + takeProfitPct) : opp.referencePriceUsd * (1 - takeProfitPct);
      lines.push(
        `Protection: hard stop $${stopPrice.toFixed(8)} (${(stopPct * 100).toFixed(2)}%) · ` +
          `take-profit $${takeProfitPrice.toFixed(8)} (${(takeProfitPct * 100).toFixed(2)}%)` +
          (opp.trailingStopPct !== undefined ? ` · trailing ${(opp.trailingStopPct * 100).toFixed(2)}%` : ""),
      );
    }
  }
  lines.push(
    executionMode === "live"
      ? "Confirm this exact Action ID in the dashboard, or reject it. Final agent parameter review is required before any external write."
      : "Simulation only: inspect or reject this action. Paper actions cannot be confirmed.",
  );
  return lines.join("\n");
}

function actionCoreKey(opp: SizedOpportunity): string {
  const paired = opp.pairedLeg;
  const raw = opp.raw ?? {};
  return [
    opp.strategy,
    opp.symbol,
    opp.direction,
    opp.venue,
    paired?.symbol ?? "",
    paired?.direction ?? "",
    paired?.venue ?? "",
    raw.type ?? "",
    raw.endpoint ?? "",
    raw.address ?? "",
    raw.triggerSymbol ?? "",
    raw.asset ?? "",
  ].join("|");
}

function actionKey(opp: SizedOpportunity, executionMode: "live" | "paper", executionContext: ExecutionContext): string {
  return [
    actionCoreKey(opp),
    executionMode,
    executionContext,
    opp.finalSizeUsd.toFixed(8),
    opp.referencePriceUsd?.toFixed(8) ?? "",
    opp.executionConstraints?.quantityStepSize ?? "",
    opp.executionConstraints?.priceTickSize ?? "",
    JSON.stringify(opp.pairedLeg ?? null),
    JSON.stringify(opp.executionConstraints ?? null),
    opp.stopPricePct ?? "",
    opp.takeProfitPct ?? "",
    opp.trailingStopPct ?? "",
    JSON.stringify(opp.raw ?? null),
  ].join("|");
}

export function createPendingAction(
  opp: SizedOpportunity,
  logPath: string = DEFAULT_LOG_PATH,
  executionMode: "live" | "paper" = "paper",
  executionContext: ExecutionContext = executionMode === "live" ? "mcp_live" : "demo",
): PendingAction {
  if (!opp.approved) {
    throw new Error(
      `Refusing to create a pending action for an opportunity the risk manager ` +
        `did not approve (${opp.symbol}): ${opp.rejectionReason ?? "no reason given"}`,
    );
  }
  if (opp.direction === "hold") {
    throw new Error(`Refusing to create a pending action for observation-only hold signal (${opp.symbol}).`);
  }
  if (!Number.isFinite(opp.finalSizeUsd) || opp.finalSizeUsd <= 0) {
    throw new Error(`Refusing to create a pending action with an invalid final size (${opp.symbol}).`);
  }
  if (executionMode === "live" && executionContext !== "mcp_live") {
    throw new Error(`Refusing to create a live action without a Binance MCP account context (${executionContext}).`);
  }
  if (executionMode === "live" && opp.signalContext === "demo") {
    throw new Error(`Refusing to create a live action from a demo signal adapter (${opp.symbol}).`);
  }
  const action: PendingAction = {
    id: `${opp.strategy}-${opp.symbol}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ACTION_TTL_MS).toISOString(),
    summary: buildSummary(opp, executionMode, executionContext),
    opportunity: opp,
    status: "pending",
    executionMode,
    executionContext,
  };
  const log = loadLog(logPath);
  const existing = log.find(
    (candidate) =>
      candidate.status === "pending" &&
      actionKey(candidate.opportunity, candidate.executionMode ?? "paper", candidate.executionContext ?? "demo") ===
        actionKey(opp, executionMode, executionContext),
  );
  if (existing) return existing;

  // A new price/size snapshot supersedes an older unresolved proposal for the
  // same signal. This prevents a user from confirming a stale version after a
  // fresh scan has already produced a different executable quantity.
  for (const candidate of log) {
    if (candidate.status === "pending" && actionCoreKey(candidate.opportunity) === actionCoreKey(opp)) {
      candidate.status = "expired";
    }
  }
  log.push(action);
  saveLog(logPath, log);
  return action;
}

export function resolveAction(
  id: string,
  decision: "confirmed" | "rejected",
  logPath: string = DEFAULT_LOG_PATH,
): PendingAction {
  const log = loadLog(logPath);
  const action = log.find((a) => a.id === id);
  if (!action) throw new Error(`No pending action found with id ${id}`);
  if (action.status !== "pending") {
    throw new Error(`Action ${id} was already resolved as '${action.status}'.`);
  }
  if (action.expiresAt && Date.parse(action.expiresAt) <= Date.now()) {
    action.status = "expired";
    saveLog(logPath, log);
    throw new Error(`Action ${id} has expired. Run a fresh read-only scan.`);
  }
  if (decision === "confirmed" && (action.executionMode !== "live" || action.executionContext !== "mcp_live")) {
    throw new Error(`Action ${id} is demo/paper or lacks MCP-live provenance; it cannot be confirmed for execution.`);
  }
  action.status = decision;
  saveLog(logPath, log);
  return action;
}

export function listPendingActions(logPath: string = DEFAULT_LOG_PATH): PendingAction[] {
  return loadLog(logPath).filter((a) => a.status === "pending");
}

export function listAllActions(logPath: string = DEFAULT_LOG_PATH): PendingAction[] {
  return loadLog(logPath);
}

export function expirePendingActionsForContext(
  executionContext: ExecutionContext,
  logPath: string = DEFAULT_LOG_PATH,
): PendingAction[] {
  const log = loadLog(logPath);
  const expired = log.filter(
    (action) =>
      (action.status === "pending" || action.status === "confirmed") &&
      (action.executionContext ?? "demo") !== executionContext,
  );
  if (expired.length === 0) return [];
  for (const action of expired) action.status = "expired";
  saveLog(logPath, log);
  return expired;
}

/**
 * A live approval must never survive a switch to a paper context (or vice
 * versa). The market/account snapshot that justified it no longer matches
 * the current execution mode, so it is expired and requires a fresh scan.
 */
export function expirePendingActionsForMode(
  executionMode: "live" | "paper",
  logPath: string = DEFAULT_LOG_PATH,
): PendingAction[] {
  const log = loadLog(logPath);
  const expired = log.filter(
    (action) =>
      (action.status === "pending" || action.status === "confirmed") &&
      (action.executionMode ?? "paper") !== executionMode &&
      action.opportunity.signalContext !== "demo",
  );
  if (expired.length === 0) return [];
  for (const action of expired) action.status = "expired";
  saveLog(logPath, log);
  return expired;
}

export function rejectAllPendingActions(logPath: string = DEFAULT_LOG_PATH): PendingAction[] {
  const log = loadLog(logPath);
  const rejected = log.filter((action) => action.status === "pending");
  if (rejected.length === 0) return [];
  for (const action of rejected) action.status = "rejected";
  saveLog(logPath, log);
  return rejected;
}

/** Revoke outstanding authorizations after a halt or a newer account scan. */
export function expireActions(predicate: (action: PendingAction) => boolean, logPath = DEFAULT_LOG_PATH): void {
  const log = loadLog(logPath);
  for (const action of log) {
    if ((action.status === "pending" || action.status === "confirmed") && predicate(action)) action.status = "expired";
  }
  saveLog(logPath, log);
}
