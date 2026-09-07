import { MemoryState, PendingAction } from "../types";
import { MemoryStore } from "../memory/store";
import { listAllActions } from "./confirmationGate";
import { buildExecutionInstruction } from "./executionRouter";
import { SNAPSHOT_TTL_MS } from "../context";

export function assertActionContext(action: PendingAction, memory: MemoryState): void {
  if (action.opportunity.raw?.type === "x402_payment") {
    if (memory.riskHalt) throw new Error(memory.riskHalt.reason);
    // The router checks the independent wallet attestation for this flow.
    buildExecutionInstruction({ ...action, status: "confirmed" });
    return;
  }
  const context = memory.accountContext;
  if (
    !context ||
    context.executionContext !== "mcp_live" ||
    context.mode !== "live" ||
    action.executionContext !== context.executionContext ||
    action.executionMode !== context.mode
  ) {
    throw new Error("Action does not match the active live account context. Run a fresh read-only scan.");
  }
  const captured = Date.parse(context.capturedAt);
  if (!Number.isFinite(captured) || captured > Date.now() + 60_000 || Date.now() - captured >= SNAPSHOT_TTL_MS) {
    throw new Error("Active account snapshot has expired. Run a fresh read-only scan.");
  }
  const opp = action.opportunity;
  const base = opp.symbol.replace(/(USDT|USDC|FDUSD|BUSD|TUSD|USDP|DAI)$/, "");
  const reducing =
    opp.venue === "spot" &&
    opp.direction === "sell" &&
    !opp.pairedLeg &&
    (context.spotAssetBalancesUsd?.[base] ?? 0) >= opp.finalSizeUsd;
  if (memory.riskHalt && !reducing) throw new Error(memory.riskHalt.reason);
  if (memory.goals?.maxPositionPct === 0) throw new Error("EMERGENCY_STOP: Risk profile is halted.");
}

/** The executor must use the durable record, not a cached instruction object. */
export function readExecutionInstruction(id: string, logPath?: string, memoryPath?: string) {
  const action = listAllActions(logPath).find((candidate) => candidate.id === id);
  if (!action) throw new Error(`No pending action found with id ${id}`);
  assertActionContext(action, new MemoryStore(memoryPath).load());
  return buildExecutionInstruction(action);
}
