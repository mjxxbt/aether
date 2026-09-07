import { normalizePortfolio } from "../../src/context";
import { StrategyInputSchema } from "../../src/schemas";
import { PortfolioSnapshot } from "../../src/types";
const p = (): PortfolioSnapshot => ({
  timestamp: new Date().toISOString(),
  totalEquityUsd: 1000,
  highWaterMarkUsd: 1000,
  currentDrawdownPct: 0,
  positions: [],
  availableBalancesUsd: { spotUsd: 1000, marginUsd: 0, usdmFuturesUsd: 0, coinmFuturesUsd: 0 },
  spotAssetBalancesUsd: {},
});
test.each([0, 0.01, 4.99])("MCP dust equity %s uses a paper baseline", (equity) => {
  const result = normalizePortfolio({ ...p(), totalEquityUsd: equity, highWaterMarkUsd: equity }, "binance_mcp");
  expect(result.portfolioMode).toBe("paper");
  expect(result.executionContext).toBe("mcp_live");
  expect(result.portfolio.totalEquityUsd).toBe(10_000);
});
test("explicit paper mode is never upgraded", () => {
  expect(normalizePortfolio({ ...p(), portfolioMode: "paper" }, "binance_mcp", "live").portfolioMode).toBe("paper");
  expect(normalizePortfolio(p(), "binance_mcp", "paper").portfolioMode).toBe("paper");
});
test("stale MCP account snapshots fail closed", () => {
  expect(() => normalizePortfolio({ ...p(), timestamp: "2020-01-01T00:00:00Z" }, "binance_mcp")).toThrow(/stale/);
});
test("a source label cannot silently opt a scenario into live execution", () => {
  expect(StrategyInputSchema.safeParse({ portfolioSource: "binance_mcp", portfolio: p() }).success).toBe(false);
});
