import { runPortfolioRebalanceStrategy } from "../../src/strategies/portfolioRebalance";
import { StrategyInput } from "../../src/types";

const input: StrategyInput = {
  goals: {
    profile: "test",
    maxDrawdownPct: 0.1,
    maxPositionPct: 0.2,
    maxOnchainExposurePct: 0.1,
    maxLeverage: 1,
    minConfidence: 0.1,
    reviewIntervalHours: 4,
    targetAllocation: { BTC: 0.5, ETHUSDT: 0.1 },
  },
  portfolio: {
    timestamp: "2026-01-01T00:00:00Z",
    totalEquityUsd: 10_000,
    highWaterMarkUsd: 10_000,
    currentDrawdownPct: 0,
    positions: [
      { symbol: "BTCUSDT", venue: "spot", sizeUsd: 1_000, unrealizedPnlUsd: 0 },
      { symbol: "BTCUSDT", venue: "usdm_futures", sizeUsd: 1_000, unrealizedPnlUsd: 0 },
    ],
  },
  markets: [],
};

describe("portfolio rebalance strategy", () => {
  it("aggregates venues and does not double-append USDT to pair symbols", () => {
    const opportunities = runPortfolioRebalanceStrategy(input);
    const btc = opportunities.find((opportunity) => opportunity.symbol === "BTCUSDT");
    expect(btc).toBeDefined();
    expect(btc!.direction).toBe("buy");
    expect(btc!.suggestedSizeUsd).toBe(3_000);
    expect(opportunities.some((opportunity) => opportunity.symbol.includes("USDTUSDT"))).toBe(false);
  });
});
