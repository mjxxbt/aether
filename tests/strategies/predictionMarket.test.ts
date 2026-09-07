import { runPredictionMarketStrategy } from "../../src/strategies/predictionMarket";
import { buildExecutionInstruction } from "../../src/execution/executionRouter";
import { createPendingAction } from "../../src/execution/confirmationGate";
import { StrategyInput } from "../../src/types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("prediction market strategy", () => {
  it("selects an explicit YES/NO outcome and routes it to the wallet order adapter", () => {
    const input: StrategyInput = {
      goals: {
        profile: "test",
        maxDrawdownPct: 0.1,
        maxPositionPct: 0.2,
        maxOnchainExposurePct: 0.1,
        maxLeverage: 1,
        minConfidence: 0.1,
        reviewIntervalHours: 4,
      },
      portfolio: {
        timestamp: "2026-01-01T00:00:00Z",
        totalEquityUsd: 10_000,
        highWaterMarkUsd: 10_000,
        currentDrawdownPct: 0,
        positions: [],
      },
      markets: [],
      predictionMarkets: [
        {
          marketId: "market-1",
          question: "Will BTC rise?",
          yesProbability: 0.7,
          noProbability: 0.3,
          yesPriceUsd: 0.5,
          noPriceUsd: 0.5,
          resolutionDate: "2099-01-01T00:00:00Z",
          liquidityUsd: 100_000,
          category: "crypto_price",
        },
      ],
    };
    const opportunity = runPredictionMarketStrategy(input)[0];
    expect(opportunity.direction).toBe("buy");
    expect(opportunity.raw?.outcome).toBe("YES");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-prediction-test-"));
    const action = createLiveAction(
      {
        ...opportunity,
        approved: true,
        finalSizeUsd: opportunity.suggestedSizeUsd,
        riskNotes: [],
      },
      path.join(tempDir, "pending.json"),
    );
    expect(action.summary).toContain("LIVE AGENT OS WALLET / SKILLS");
    const instruction = buildExecutionInstruction({ ...action, status: "confirmed" });
    expect(instruction.toolHint).toBe("agentic-wallet.prediction-market-order");
    expect(instruction.args.outcome).toBe("YES");
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
