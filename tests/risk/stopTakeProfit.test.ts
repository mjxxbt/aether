import { evaluateOpportunity, evaluateAll } from "../../src/risk/riskManager";
import { Opportunity, PortfolioSnapshot, RiskGoals } from "../../src/types";

function makeGoals(overrides: Partial<RiskGoals> = {}): RiskGoals {
  return {
    profile: "balanced",
    maxDrawdownPct: 0.08,
    maxPositionPct: 0.2,
    maxOnchainExposurePct: 0.1,
    maxLeverage: 3,
    minConfidence: 0.3,
    reviewIntervalHours: 4,
    ...overrides,
  };
}

function makePortfolio(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    timestamp: new Date().toISOString(),
    totalEquityUsd: 10000,
    highWaterMarkUsd: 10000,
    currentDrawdownPct: 0,
    positions: [],
    ...overrides,
  };
}

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    strategy: "momentum",
    symbol: "BTCUSDT",
    direction: "long",
    venue: "spot",
    confidence: 0.75,
    rationale: "Test",
    suggestedSizeUsd: 1000,
    ...overrides,
  };
}

describe("riskManager — stop-loss / take-profit attachment", () => {
  it("attaches stopPricePct and takeProfitPct for approved directional spot trade", () => {
    const sized = evaluateOpportunity(makeOpp(), makeGoals(), makePortfolio());
    expect(sized.approved).toBe(true);
    expect(sized.stopPricePct).toBeDefined();
    expect(sized.takeProfitPct).toBeDefined();
    expect(sized.takeProfitPct!).toBeCloseTo(sized.stopPricePct! * 3, 5);
  });

  it("attaches stop/TP for futures trades", () => {
    const opp = makeOpp({ venue: "usdm_futures", direction: "short" });
    const sized = evaluateOpportunity(opp, makeGoals(), makePortfolio());
    expect(sized.approved).toBe(true);
    expect(sized.stopPricePct).toBeDefined();
    expect(sized.takeProfitPct).toBeDefined();
  });

  it("does NOT attach stop/TP for on-chain trades", () => {
    const opp = makeOpp({ venue: "onchain", direction: "buy" });
    const sized = evaluateOpportunity(opp, makeGoals(), makePortfolio());
    expect(sized.stopPricePct).toBeUndefined();
    expect(sized.takeProfitPct).toBeUndefined();
  });

  it("does NOT attach stop/TP for hold direction", () => {
    const opp = makeOpp({ venue: "spot", direction: "hold" });
    const sized = evaluateOpportunity(opp, makeGoals(), makePortfolio());
    expect(sized.stopPricePct).toBeUndefined();
    expect(sized.takeProfitPct).toBeUndefined();
  });

  it("stop pct is capped at 5%", () => {
    // maxDrawdownPct=0.5, maxPositionPct=0.01 → ratio=50, cap kicks in at 0.05
    const goals = makeGoals({ maxDrawdownPct: 0.5, maxPositionPct: 0.01 });
    const sized = evaluateOpportunity(makeOpp(), goals, makePortfolio());
    expect(sized.stopPricePct).toBe(0.05);
  });

  it("stop/TP note appears in riskNotes", () => {
    const sized = evaluateOpportunity(makeOpp(), makeGoals(), makePortfolio());
    expect(sized.riskNotes.some((n) => n.includes("Initial hard stop"))).toBe(true);
    expect(sized.riskNotes.some((n) => n.includes("Trailing stop activated"))).toBe(true);
  });

  it("does NOT attach stop/TP for rejected opportunities", () => {
    const goals = makeGoals({ maxDrawdownPct: 0.0 }); // drawdown at limit from start
    const portfolio = makePortfolio({ currentDrawdownPct: 0.0 });
    const sized = evaluateOpportunity(makeOpp(), goals, portfolio);
    expect(sized.approved).toBe(false);
    expect(sized.stopPricePct).toBeUndefined();
  });
});

describe("riskManager — EMERGENCY_STOP tag", () => {
  it("prefixes rejection reason with EMERGENCY_STOP when drawdown trips", () => {
    const goals = makeGoals({ maxDrawdownPct: 0.05 });
    const portfolio = makePortfolio({ currentDrawdownPct: 0.06 });
    const sized = evaluateOpportunity(makeOpp(), goals, portfolio);
    expect(sized.approved).toBe(false);
    expect(sized.rejectionReason).toMatch(/^EMERGENCY_STOP:/);
  });

  it("evaluateAll flags all opportunities when drawdown trips", () => {
    const goals = makeGoals({ maxDrawdownPct: 0.05 });
    const portfolio = makePortfolio({ currentDrawdownPct: 0.1 });
    const opps = [makeOpp(), makeOpp({ symbol: "ETHUSDT" })];
    const sized = evaluateAll(opps, goals, portfolio);
    expect(sized.every((s) => !s.approved)).toBe(true);
    expect(sized.every((s) => s.rejectionReason?.startsWith("EMERGENCY_STOP:"))).toBe(true);
  });
});
