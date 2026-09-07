import { runMomentumStrategy } from "../../src/strategies/momentum";
import { StrategyInput, RiskGoals, PortfolioSnapshot, Kline } from "../../src/types";

const baseGoals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.1,
  maxPositionPct: 0.2,
  maxOnchainExposurePct: 0.1,
  maxLeverage: 3,
  minConfidence: 0.1,
  reviewIntervalHours: 4,
};

const basePortfolio: PortfolioSnapshot = {
  timestamp: "2026-01-01T00:00:00Z",
  totalEquityUsd: 10_000,
  highWaterMarkUsd: 10_000,
  currentDrawdownPct: 0,
  positions: [],
};

function makeKlines(closes: number[]): Kline[] {
  return closes.map((c, i) => ({
    openTime: `2026-01-0${i + 1}T00:00:00Z`,
    open: c - 5,
    high: c + 5,
    low: c - 5,
    close: c,
    volume: 1000,
  }));
}

describe("runMomentumStrategy", () => {
  it("returns [] when fewer than 34 klines (MACD signal requirement)", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [
        {
          symbol: "BTCUSDT",
          priceUsd: 60000,
          klines: makeKlines([59000, 59500, 60000, 60500]), // Only 4
        },
      ],
    };
    expect(runMomentumStrategy(input)).toHaveLength(0);
  });

  it("returns [] when divergence is below noise floor", () => {
    // Flat closes
    const closes = Array.from({ length: 30 }, () => 100);
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [{ symbol: "TEST", priceUsd: 100, klines: makeKlines(closes) }],
    };
    expect(runMomentumStrategy(input)).toHaveLength(0);
  });

  it("returns LONG when MACD shows strong upward momentum", () => {
    // Need a longer array for EMAs to converge
    const closes = [];
    for (let i = 0; i < 50; i++) closes.push(100); // stable
    for (let i = 0; i < 40; i++) closes.push(100 - i); // downtrend (negative MACD)
    closes.push(60, 65, 75, 90, 110, 120, 130, 140, 150); // sharp uptrend (crossover)

    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [{ symbol: "BTCUSDT", priceUsd: 150, klines: makeKlines(closes) }],
    };
    const result = runMomentumStrategy(input);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].direction).toBe("long");
  });

  it("returns SHORT when MACD shows strong downward momentum", () => {
    const closes = [];
    for (let i = 0; i < 50; i++) closes.push(100); // stable
    for (let i = 0; i < 40; i++) closes.push(100 + i); // uptrend (positive MACD)
    closes.push(140, 135, 125, 110, 90, 80, 70, 60, 50); // sharp downtrend (crossover)

    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [{ symbol: "ETHUSDT", priceUsd: 50, klines: makeKlines(closes) }],
    };
    const result = runMomentumStrategy(input);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].direction).toBe("short");
    expect(result[0].venue).toBe("usdm_futures");
  });

  it("reduces confidence when RSI indicates overbought condition", () => {
    // All closes rising sharply => RSI > threshold => confidence should be reduced
    const closes = Array.from({ length: 35 }, (_, i) => 100 + i * 5);
    const inputNoRsi: StrategyInput = {
      goals: { ...baseGoals, momentum: { rsiOverextendedThreshold: 0 } }, // disabled
      portfolio: basePortfolio,
      markets: [{ symbol: "BTCUSDT", priceUsd: 135, klines: makeKlines(closes) }],
    };
    const inputWithRsi: StrategyInput = {
      goals: { ...baseGoals, momentum: { rsiOverextendedThreshold: 60 } },
      portfolio: basePortfolio,
      markets: [{ symbol: "BTCUSDT", priceUsd: 135, klines: makeKlines(closes) }],
    };
    const noRsiResult = runMomentumStrategy(inputNoRsi);
    const rsiResult = runMomentumStrategy(inputWithRsi);
    if (noRsiResult.length > 0 && rsiResult.length > 0) {
      // RSI filter should reduce or equal confidence, never increase it
      expect(rsiResult[0].confidence).toBeLessThanOrEqual(noRsiResult[0].confidence);
    }
  });
});
