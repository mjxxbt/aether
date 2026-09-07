import { evaluateOpportunity, evaluateAll } from "../../src/risk/riskManager";
import { Opportunity, PortfolioSnapshot, RiskGoals } from "../../src/types";

const baseGoals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.08,
  maxPositionPct: 0.2,
  maxOnchainExposurePct: 0.1,
  maxLeverage: 3,
  minConfidence: 0.3,
  reviewIntervalHours: 4,
};

const basePortfolio: PortfolioSnapshot = {
  timestamp: "2026-01-01T00:00:00Z",
  totalEquityUsd: 10_000,
  highWaterMarkUsd: 10_800,
  currentDrawdownPct: 0,
  positions: [],
};

const baseOpp: Opportunity = {
  strategy: "momentum",
  symbol: "BTCUSDT",
  direction: "long",
  venue: "spot",
  confidence: 0.8,
  rationale: "Test opportunity",
  suggestedSizeUsd: 1500,
};

describe("evaluateOpportunity — drawdown circuit breaker", () => {
  it("rejects all new trades when drawdown >= maxDrawdownPct", () => {
    const portfolio: PortfolioSnapshot = {
      ...basePortfolio,
      currentDrawdownPct: 0.08, // exactly at the limit
    };
    const result = evaluateOpportunity(baseOpp, baseGoals, portfolio);
    expect(result.approved).toBe(false);
    expect(result.finalSizeUsd).toBe(0);
    expect(result.rejectionReason).toMatch(/drawdown/i);
  });

  it("allows trades when drawdown is just below the limit", () => {
    const portfolio: PortfolioSnapshot = {
      ...basePortfolio,
      currentDrawdownPct: 0.0799,
    };
    const result = evaluateOpportunity(baseOpp, baseGoals, portfolio);
    expect(result.approved).toBe(true);
  });
});

describe("evaluateOpportunity — position size clamping", () => {
  it("clamps size to maxPositionPct of equity", () => {
    const opp: Opportunity = { ...baseOpp, suggestedSizeUsd: 5000 }; // > 20% of 10k
    const result = evaluateOpportunity(opp, baseGoals, basePortfolio);
    expect(result.finalSizeUsd).toBeLessThanOrEqual(10_000 * 0.2);
    expect(result.riskNotes.some((n) => /clamped/i.test(n))).toBe(true);
  });

  it("approves full size when within position cap", () => {
    const opp: Opportunity = { ...baseOpp, suggestedSizeUsd: 1000 }; // 10% of 10k
    const result = evaluateOpportunity(opp, baseGoals, basePortfolio);
    expect(result.finalSizeUsd).toBe(1000);
  });

  it("rejects an amount that rounds to zero instead of approving a zero-size action", () => {
    const result = evaluateOpportunity({ ...baseOpp, suggestedSizeUsd: 0.001 }, baseGoals, basePortfolio);
    expect(result.approved).toBe(false);
    expect(result.finalSizeUsd).toBe(0);
    expect(result.rejectionReason).toMatch(/rounded to zero/i);
  });
});

describe("evaluateOpportunity — on-chain exposure cap", () => {
  it("clamps on-chain size to remaining on-chain budget", () => {
    const portfolio: PortfolioSnapshot = {
      ...basePortfolio,
      positions: [{ symbol: "TOKENA", venue: "onchain", sizeUsd: 900, unrealizedPnlUsd: 0 }],
    };
    const opp: Opportunity = {
      ...baseOpp,
      venue: "onchain",
      suggestedSizeUsd: 2000,
    };
    // maxOnchain = 10k * 0.1 = 1000, already 900 deployed => 100 remaining
    const result = evaluateOpportunity(opp, baseGoals, portfolio);
    expect(result.finalSizeUsd).toBeLessThanOrEqual(100);
    expect(result.riskNotes.some((n) => /on-chain/i.test(n))).toBe(true);
  });

  it("rejects on-chain trade when budget is zero", () => {
    const portfolio: PortfolioSnapshot = {
      ...basePortfolio,
      positions: [{ symbol: "TOKENA", venue: "onchain", sizeUsd: 1000, unrealizedPnlUsd: 0 }],
    };
    const opp: Opportunity = {
      ...baseOpp,
      venue: "onchain",
      suggestedSizeUsd: 500,
    };
    const result = evaluateOpportunity(opp, baseGoals, portfolio);
    expect(result.approved).toBe(false);
    expect(result.finalSizeUsd).toBe(0);
  });
});

describe("evaluateOpportunity — leverage ceiling", () => {
  it("rejects futures trade when maxLeverage is below 1x", () => {
    const goals: RiskGoals = { ...baseGoals, maxLeverage: 0 };
    const opp: Opportunity = { ...baseOpp, venue: "usdm_futures" };
    const result = evaluateOpportunity(opp, goals, basePortfolio);
    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toMatch(/leverage/i);
  });

  it("approves futures when leverage is >= 1x", () => {
    const opp: Opportunity = { ...baseOpp, venue: "usdm_futures", suggestedSizeUsd: 500 };
    const result = evaluateOpportunity(opp, baseGoals, basePortfolio);
    expect(result.approved).toBe(true);
  });

  it("treats 1x as the gross exposure ceiling and counts paired legs", () => {
    const goals: RiskGoals = { ...baseGoals, maxLeverage: 1 };
    const portfolio: PortfolioSnapshot = {
      ...basePortfolio,
      positions: [{ symbol: "ETHUSDT", venue: "spot", sizeUsd: 9500, unrealizedPnlUsd: 0 }],
    };
    const opp: Opportunity = {
      ...baseOpp,
      strategy: "funding_rate_neutral",
      venue: "usdm_futures",
      suggestedSizeUsd: 500,
      pairedLeg: {
        symbol: "BTCUSDT",
        direction: "buy",
        venue: "spot",
        sizeUsd: 500,
        rationale: "hedge",
      },
    };
    const result = evaluateOpportunity(opp, goals, portfolio);
    expect(result.approved).toBe(true);
    expect(result.finalSizeUsd).toBe(250);
    expect(result.pairedLeg?.sizeUsd).toBe(250);
  });
});

describe("evaluateOpportunity — confidence floor", () => {
  it("rejects below minConfidence", () => {
    const opp: Opportunity = { ...baseOpp, confidence: 0.1 }; // below 0.3
    const result = evaluateOpportunity(opp, baseGoals, basePortfolio);
    expect(result.approved).toBe(false);
  });
});

describe("evaluateOpportunity — executable venue safeguards", () => {
  it("rejects a CEX notional below the conservative Binance floor", () => {
    const result = evaluateOpportunity({ ...baseOpp, suggestedSizeUsd: 2 }, baseGoals, {
      ...basePortfolio,
      totalEquityUsd: 50,
    });
    expect(result.approved).toBe(false);
    expect(result.finalSizeUsd).toBe(0);
    expect(result.rejectionReason).toMatch(/minimum executable notional/i);
  });

  it("rejects an explicitly unfunded futures venue", () => {
    const result = evaluateOpportunity(
      { ...baseOpp, venue: "usdm_futures", direction: "short", suggestedSizeUsd: 50 },
      baseGoals,
      {
        ...basePortfolio,
        availableBalancesUsd: {
          spotUsd: 50,
          marginUsd: 0,
          usdmFuturesUsd: 0,
          coinmFuturesUsd: 0,
        },
      },
    );
    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toMatch(/usdm_futures collateral/i);
  });

  it("preserves the live price for exact downstream protection calculations", () => {
    const result = evaluateOpportunity(baseOpp, baseGoals, basePortfolio, [
      { symbol: "BTCUSDT", priceUsd: 100, klines: [] },
    ]);
    expect(result.approved).toBe(true);
    expect(result.referencePriceUsd).toBe(100);
  });

  it("clamps a live Spot BUY to the available quote balance", () => {
    const result = evaluateOpportunity({ ...baseOpp, suggestedSizeUsd: 100 }, baseGoals, {
      ...basePortfolio,
      portfolioMode: "live",
      availableBalancesUsd: {
        spotUsd: 20,
        marginUsd: 0,
        usdmFuturesUsd: 0,
        coinmFuturesUsd: 0,
      },
      spotAssetBalancesUsd: {},
    });
    expect(result.approved).toBe(true);
    expect(result.finalSizeUsd).toBeCloseTo(19.98, 2);
  });

  it("rejects a live Spot SELL when the base asset is not held", () => {
    const result = evaluateOpportunity({ ...baseOpp, direction: "sell", suggestedSizeUsd: 50 }, baseGoals, {
      ...basePortfolio,
      portfolioMode: "live",
      availableBalancesUsd: {
        spotUsd: 20,
        marginUsd: 0,
        usdmFuturesUsd: 0,
        coinmFuturesUsd: 0,
      },
      spotAssetBalancesUsd: {},
    });
    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toMatch(/BTC.*balance|base-asset/i);
  });

  it("caps a live Spot SELL to the USD value of the base asset held", () => {
    const result = evaluateOpportunity({ ...baseOpp, direction: "sell", suggestedSizeUsd: 50 }, baseGoals, {
      ...basePortfolio,
      portfolioMode: "live",
      availableBalancesUsd: {
        spotUsd: 0,
        marginUsd: 0,
        usdmFuturesUsd: 0,
        coinmFuturesUsd: 0,
      },
      spotAssetBalancesUsd: { BTC: 10 },
    });
    expect(result.approved).toBe(true);
    expect(result.finalSizeUsd).toBeCloseTo(9.99, 2);
  });

  it("caps a live margin short to explicitly supplied collateral", () => {
    const result = evaluateOpportunity(
      { ...baseOpp, venue: "margin", direction: "short", suggestedSizeUsd: 100 },
      baseGoals,
      {
        ...basePortfolio,
        portfolioMode: "live",
        availableBalancesUsd: {
          spotUsd: 0,
          marginUsd: 20,
          usdmFuturesUsd: 0,
          coinmFuturesUsd: 0,
        },
        spotAssetBalancesUsd: {},
      },
    );
    expect(result.approved).toBe(true);
    expect(result.finalSizeUsd).toBeCloseTo(19.98, 2);
  });
});

describe("evaluateOpportunity — non-executable observations", () => {
  it("rejects hold signals instead of allowing them into the execution gate", () => {
    const result = evaluateOpportunity({ ...baseOpp, direction: "hold" }, baseGoals, basePortfolio);
    expect(result.approved).toBe(false);
    expect(result.finalSizeUsd).toBe(0);
    expect(result.rejectionReason).toMatch(/observation-only/i);
  });
});

describe("evaluateAll", () => {
  it("evaluates multiple opportunities independently", () => {
    const opps: Opportunity[] = [
      { ...baseOpp, suggestedSizeUsd: 500 },
      { ...baseOpp, symbol: "ETHUSDT", suggestedSizeUsd: 800, venue: "spot" },
    ];
    const results = evaluateAll(opps, baseGoals, basePortfolio);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.approved)).toBe(true);
  });
});
