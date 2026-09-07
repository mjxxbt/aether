import { evaluateAll, evaluateOpportunity } from "../../src/risk/riskManager";
import { Opportunity, PortfolioSnapshot, RiskGoals } from "../../src/types";

const goals: RiskGoals = {
  profile: "test",
  maxDrawdownPct: 0.2,
  maxPositionPct: 0.2,
  maxOnchainExposurePct: 0.1,
  maxLeverage: 1,
  minConfidence: 0.3,
  reviewIntervalHours: 4,
};
const portfolio: PortfolioSnapshot = {
  timestamp: new Date().toISOString(),
  totalEquityUsd: 1000,
  highWaterMarkUsd: 1000,
  currentDrawdownPct: 0,
  positions: [],
  portfolioMode: "live",
  availableBalancesUsd: { spotUsd: 1000, marginUsd: 0, usdmFuturesUsd: 0, coinmFuturesUsd: 0 },
  spotAssetBalancesUsd: {},
};
const opp: Opportunity = {
  strategy: "momentum",
  symbol: "BTCUSDT",
  direction: "buy",
  venue: "spot",
  confidence: 0.8,
  rationale: "test",
  suggestedSizeUsd: 200,
};

test("a batch cannot spend the same collateral or gross budget twice", () => {
  const results = evaluateAll(
    Array.from({ length: 8 }, (_, i) => ({ ...opp, symbol: `ASSET${i}USDT` })),
    goals,
    portfolio,
  );
  expect(results.reduce((sum, r) => sum + r.finalSizeUsd, 0)).toBeLessThanOrEqual(1000);
  expect(portfolio.positions).toEqual([]);
  expect(portfolio.availableBalancesUsd?.spotUsd).toBe(1000);
});
test("a batch shares the on-chain limit", () => {
  const results = evaluateAll(
    Array.from({ length: 3 }, (_, i) => ({ ...opp, venue: "onchain" as const, symbol: `TOKEN${i}` })),
    goals,
    portfolio,
  );
  expect(results.reduce((sum, r) => sum + r.finalSizeUsd, 0)).toBe(100);
});
test("multiple strategies share the per-position cap", () => {
  const results = evaluateAll([opp, { ...opp, strategy: "portfolio_rebalance" }], goals, portfolio);
  expect(results.reduce((sum, r) => sum + r.finalSizeUsd, 0)).toBe(200);
});
test("held Spot exits remain possible during drawdown without opening shorts", () => {
  const p = { ...portfolio, highWaterMarkUsd: 1250, currentDrawdownPct: 0.2, spotAssetBalancesUsd: { BTC: 300 } };
  expect(evaluateOpportunity({ ...opp, direction: "sell" }, goals, p).approved).toBe(true);
  expect(evaluateOpportunity({ ...opp, direction: "sell", symbol: "ETHUSDT" }, goals, p).approved).toBe(false);
  expect(evaluateOpportunity(opp, goals, p).approved).toBe(false);
});
test("live sizing rejects missing collateral snapshots", () => {
  expect(evaluateOpportunity(opp, goals, { ...portfolio, availableBalancesUsd: undefined }).approved).toBe(false);
});
