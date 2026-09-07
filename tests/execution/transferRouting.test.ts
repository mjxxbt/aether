import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createPendingAction, resolveAction } from "../../src/execution/confirmationGate";
import { buildExecutionInstruction } from "../../src/execution/executionRouter";
import { SizedOpportunity } from "../../src/types";
import { proposePayment, confirmPayment } from "../../src/execution/x402Payment";

function tempLogPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-transfer-test-"));
  return path.join(tmpDir, "pending.json");
}

function makeTransferOpp(): SizedOpportunity {
  return {
    strategy: "convert_yield",
    symbol: "USDT",
    direction: "buy",
    venue: "transfer",
    confidence: 0.35,
    rationale: "Spot→Futures transfer to enable funding strategy",
    suggestedSizeUsd: 2500,
    approved: true,
    finalSizeUsd: 2500,
    riskNotes: [],
    raw: {
      fromAccountType: "SPOT",
      toAccountType: "UMFUTURE",
      asset: "USDT",
    },
  };
}

describe("executionRouter — transfer routing", () => {
  it("routes transfer venue to binance_mcp with futures transfer toolHint", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeTransferOpp(), logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.route).toBe("binance_mcp");
    expect(instr.toolHint).toBe("binance-mcp.futures.transfer");
  });

  it("includes asset and amount in transfer args", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeTransferOpp(), logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.args.asset).toBe("USDT");
    expect(instr.args.amount).toBe(2500);
  });

  it("transfer type=1 for SPOT→UMFUTURE", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeTransferOpp(), logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.args.type).toBe(1);
  });

  it("includes stopLossPct in args for CEX directional trade with stop/TP", () => {
    const opp: SizedOpportunity = {
      strategy: "momentum",
      symbol: "BTCUSDT",
      direction: "long",
      venue: "spot",
      confidence: 0.75,
      rationale: "Test",
      suggestedSizeUsd: 1000,
      approved: true,
      finalSizeUsd: 1000,
      riskNotes: [],
      stopPricePct: 0.02,
      takeProfitPct: 0.04,
      referencePriceUsd: 100,
    };
    const logPath = tempLogPath();
    const action = createLiveAction(opp, logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.args.quantity).toBe(10);
    expect(instr.args.stopLossPct).toBeUndefined();
    expect(instr.protectionPlan?.stopLossPriceUsd).toBe(98);
    expect(instr.protectionPlan?.takeProfitPriceUsd).toBe(104);
  });

  it("does not include stop/TP args for on-chain trades", () => {
    const opp: SizedOpportunity = {
      strategy: "onchain_alpha",
      symbol: "TOKEN",
      direction: "buy",
      venue: "onchain",
      confidence: 0.6,
      rationale: "Test",
      suggestedSizeUsd: 500,
      approved: true,
      finalSizeUsd: 500,
      riskNotes: [],
    };
    const logPath = tempLogPath();
    const action = createLiveAction(opp, logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.args.stopLossPct).toBeUndefined();
  });
});

describe("x402 payment gate", () => {
  it("validates, gates, and routes a payment without treating it as a trade", () => {
    const logPath = tempLogPath();
    const pending = proposePayment(
      {
        signalDescription: "Premium momentum signal",
        endpoint: "https://example.com/signal",
        currency: "USDC",
        amountUsd: 0.5,
        targetStrategy: "momentum",
      },
      logPath,
      { source: "agent_os_wallet", executionMode: "live", capturedAt: new Date().toISOString(), walletAvailableUsd: 1 },
    );

    expect(() => buildExecutionInstruction(pending)).toThrow(/not 'confirmed'/i);
    expect(() => confirmPayment(pending.id, logPath)).toThrow(/not 'confirmed'/);
    resolveAction(pending.id, "confirmed", logPath);
    const instruction = confirmPayment(pending.id, logPath);
    expect(instruction.route).toBe("x402");
    expect(instruction.amountUsd).toBe(0.5);
    const engineInstruction = buildExecutionInstruction({ ...pending, status: "confirmed" });
    expect(engineInstruction.route).toBe("x402");
    expect(engineInstruction.toolHint).toContain("x402");
  });

  it("rejects invalid payment requests before writing an approval", () => {
    const logPath = tempLogPath();
    expect(() =>
      proposePayment(
        {
          signalDescription: "",
          endpoint: "not-a-url",
          currency: "USDC",
          amountUsd: 0,
          targetStrategy: "momentum",
        },
        logPath,
      ),
    ).toThrow(/required|valid|greater than zero/i);
  });
});

// Routing fixtures opt into live mode explicitly; production defaults remain paper.
function createLiveAction(
  opp: Parameters<typeof createPendingAction>[0],
  logPath?: string,
  mode: "live" | "paper" = "live",
  context: "mcp_live" | "demo" = mode === "live" ? "mcp_live" : "demo",
) {
  return createPendingAction(opp, logPath, mode, context);
}
