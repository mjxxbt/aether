import { runOnchainAlphaStrategy } from "../../src/strategies/onchainAlpha";
import {
  StrategyInput,
  MemoryState,
  RiskGoals,
  PortfolioSnapshot,
  StrategyId,
  StrategyPerformance,
} from "../../src/types";

const baseGoals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.1,
  maxPositionPct: 0.2,
  maxOnchainExposurePct: 0.2,
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

function emptyMemory(): MemoryState {
  const strategies: StrategyId[] = [
    "funding_rate",
    "funding_rate_neutral",
    "momentum",
    "onchain_alpha",
    "convert_yield",
    "prediction_market",
    "portfolio_rebalance",
  ];
  const performance = {} as Record<StrategyId, StrategyPerformance>;
  for (const s of strategies) {
    performance[s] = {
      strategy: s,
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnlUsd: 0,
      winRate: 0,
      weight: 1,
      paused: false,
    };
  }
  return { trades: [], performance, lastUpdated: new Date().toISOString() };
}

describe("runOnchainAlphaStrategy", () => {
  it("returns [] when onchainCandidates is empty", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
    };
    expect(runOnchainAlphaStrategy(input, emptyMemory())).toHaveLength(0);
  });

  it("gates out unaudited candidates regardless of trend score", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        {
          chain: "bsc",
          address: "0xbad",
          symbol: "RUG",
          auditPassed: false,
          liquidityUsd: 5_000_000,
          trendScore: 0.99,
        },
      ],
    };
    expect(runOnchainAlphaStrategy(input, emptyMemory())).toHaveLength(0);
  });

  it("gates out candidates below MIN_LIQUIDITY_USD ($250k)", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        { chain: "bsc", address: "0xlow", symbol: "TINY", auditPassed: true, liquidityUsd: 100_000, trendScore: 0.9 },
      ],
    };
    expect(runOnchainAlphaStrategy(input, emptyMemory())).toHaveLength(0);
  });

  it("returns an opportunity for a valid audited candidate", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        { chain: "bsc", address: "0xgood", symbol: "GOOD", auditPassed: true, liquidityUsd: 500_000, trendScore: 0.7 },
      ],
    };
    const result = runOnchainAlphaStrategy(input, emptyMemory());
    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe("onchain_alpha");
  });

  it("applies tier 1 size multiplier for micro liquidity", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        {
          chain: "bsc",
          address: "0xmicro",
          symbol: "MICRO",
          auditPassed: true,
          liquidityUsd: 400_000,
          trendScore: 1.0,
        },
      ],
    };
    const result = runOnchainAlphaStrategy(input, emptyMemory());
    expect(result).toHaveLength(1);
    // Tier 1: mult=0.3, maxOnchain=10000*0.2=2000, size=2000*0.3*1.0=600
    expect(result[0].suggestedSizeUsd).toBeCloseTo(600, 0);
  });

  it("applies tier 3 size multiplier for established liquidity + holders", () => {
    const input: StrategyInput = {
      goals: baseGoals,
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        {
          chain: "bsc",
          address: "0xbig",
          symbol: "BIG",
          auditPassed: true,
          liquidityUsd: 10_000_000,
          holderCount: 10_000,
          trendScore: 1.0,
        },
      ],
    };
    const result = runOnchainAlphaStrategy(input, emptyMemory());
    // Tier 3: mult=1.0
    expect(result[0].suggestedSizeUsd).toBeCloseTo(2000, 0); // 2000 * 1.0 * 1.0
  });

  it("suppresses a candidate within cooldown window", () => {
    const memory = emptyMemory();
    memory.onchainCooldowns = {
      "0xcool": new Date().toISOString(), // just now
    };
    const input: StrategyInput = {
      goals: { ...baseGoals, onchainCooldownHours: 12 },
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        { chain: "bsc", address: "0xcool", symbol: "COOL", auditPassed: true, liquidityUsd: 500_000, trendScore: 0.9 },
      ],
    };
    expect(runOnchainAlphaStrategy(input, memory)).toHaveLength(0);
  });

  it("allows a candidate after cooldown has expired", () => {
    const memory = emptyMemory();
    const longAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25 hours ago
    memory.onchainCooldowns = { "0xcool": longAgo };
    const input: StrategyInput = {
      goals: { ...baseGoals, onchainCooldownHours: 12 },
      portfolio: basePortfolio,
      markets: [],
      onchainCandidates: [
        { chain: "bsc", address: "0xcool", symbol: "COOL", auditPassed: true, liquidityUsd: 500_000, trendScore: 0.9 },
      ],
    };
    expect(runOnchainAlphaStrategy(input, memory)).toHaveLength(1);
  });
});
