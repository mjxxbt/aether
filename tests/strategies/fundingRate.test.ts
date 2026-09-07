import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { scoreFunding, NORMAL_FUNDING_BAND, EXTREME_FUNDING } from "../../src/strategies/fundingRate";
import { runFundingRateStrategy } from "../../src/strategies/fundingRate";
import { runFundingRateNeutralStrategy } from "../../src/strategies/fundingRateNeutral";
import { StrategyInput, RiskGoals, PortfolioSnapshot } from "../../src/types";

const baseGoals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.1,
  maxPositionPct: 0.2,
  maxOnchainExposurePct: 0.1,
  maxLeverage: 3,
  minConfidence: 0.2,
  reviewIntervalHours: 4,
};

const basePortfolio: PortfolioSnapshot = {
  timestamp: "2026-01-01T00:00:00Z",
  totalEquityUsd: 10_000,
  highWaterMarkUsd: 10_000,
  currentDrawdownPct: 0,
  positions: [],
};

const baseInput: StrategyInput = {
  goals: baseGoals,
  portfolio: basePortfolio,
  markets: [],
};

describe("scoreFunding", () => {
  it("returns 0 at exactly the normal band (no signal)", () => {
    expect(scoreFunding(NORMAL_FUNDING_BAND)).toBe(0);
    expect(scoreFunding(-NORMAL_FUNDING_BAND)).toBe(0);
  });

  it("returns 0 below the normal band", () => {
    expect(scoreFunding(0.0001)).toBe(0);
    expect(scoreFunding(0)).toBe(0);
  });

  it("returns > 0 just above the normal band", () => {
    const result = scoreFunding(NORMAL_FUNDING_BAND + 0.0001);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("returns 1 at the extreme funding level", () => {
    expect(scoreFunding(EXTREME_FUNDING)).toBe(1);
  });

  it("caps at 1 beyond extreme funding", () => {
    expect(scoreFunding(EXTREME_FUNDING * 5)).toBe(1);
  });

  it("treats negative rates symmetrically", () => {
    const pos = scoreFunding(0.001);
    const neg = scoreFunding(-0.001);
    expect(pos).toBeCloseTo(neg, 6);
  });
});

describe("runFundingRateStrategy", () => {
  it("returns [] when no market has a fundingRate", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "BTCUSDT", priceUsd: 60000 }],
    };
    expect(runFundingRateStrategy(input)).toHaveLength(0);
  });

  it("returns [] when fundingRate is within normal band", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "BTCUSDT", priceUsd: 60000, fundingRate: 0.0001 }],
    };
    expect(runFundingRateStrategy(input)).toHaveLength(0);
  });

  it("returns a SHORT opportunity when fundingRate is high positive", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "BTCUSDT", priceUsd: 60000, fundingRate: 0.001 }],
    };
    const result = runFundingRateStrategy(input);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("short");
    expect(result[0].strategy).toBe("funding_rate");
  });

  it("returns a LONG opportunity when fundingRate is strongly negative", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "ETHUSDT", priceUsd: 2500, fundingRate: -0.001 }],
    };
    const result = runFundingRateStrategy(input);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("long");
  });

  it("excludes opportunities below minConfidence", () => {
    const input: StrategyInput = {
      ...baseInput,
      goals: { ...baseGoals, minConfidence: 0.99 },
      markets: [{ symbol: "BTCUSDT", priceUsd: 60000, fundingRate: 0.0005 }],
    };
    expect(runFundingRateStrategy(input)).toHaveLength(0);
  });
});

describe("runFundingRateNeutralStrategy", () => {
  it("returns a paired opportunity with both legs", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "BTCUSDT", priceUsd: 60000, fundingRate: 0.001 }],
    };
    const result = runFundingRateNeutralStrategy(input);
    expect(result).toHaveLength(1);
    expect(result[0].pairedLeg).toBeDefined();
    expect(result[0].pairedLeg!.venue).toBe("spot");
    expect(result[0].pairedLeg!.direction).toBe("buy"); // positive funding => short perp, buy spot
    expect(result[0].strategy).toBe("funding_rate_neutral");
  });

  it("pairs SELL spot for negative funding", () => {
    const input: StrategyInput = {
      ...baseInput,
      markets: [{ symbol: "ETHUSDT", priceUsd: 2500, fundingRate: -0.001 }],
    };
    const result = runFundingRateNeutralStrategy(input);
    expect(result[0].pairedLeg!.direction).toBe("sell");
  });
});
