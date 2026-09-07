import { buildScenarios } from "../../src/backtest/buildScenarios";
import { RiskGoals } from "../../src/types";

const goals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.1,
  maxPositionPct: 0.1,
  maxOnchainExposurePct: 0,
  maxLeverage: 1,
  minConfidence: 0.5,
  reviewIntervalHours: 4,
};

describe("backtest scenario builder", () => {
  it("uses enough history for the momentum strategy by default", () => {
    const klines = Array.from({ length: 36 }, (_, index) => {
      const close = 100 + index;
      return {
        openTime: `2026-01-01T${String(index).padStart(2, "0")}:00:00.000Z`,
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 1000,
      };
    });

    const scenarios = buildScenarios({ BTCUSDT: klines }, goals, 10_000);

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].markets[0].klines).toHaveLength(34);
  });
});
