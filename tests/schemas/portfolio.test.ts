import { PortfolioSnapshotSchema } from "../../src/schemas";

const validPortfolio = {
  timestamp: "2026-09-06T03:30:00.000Z",
  totalEquityUsd: 100,
  highWaterMarkUsd: 120,
  currentDrawdownPct: 1 / 6,
  positions: [],
  portfolioMode: "live" as const,
  executionContext: "mcp_live" as const,
  availableBalancesUsd: {
    spotUsd: 50,
    marginUsd: 0,
    usdmFuturesUsd: 50,
    coinmFuturesUsd: 0,
  },
  spotAssetBalancesUsd: { BTC: 20 },
};

describe("PortfolioSnapshotSchema", () => {
  it("accepts a complete live account handoff", () => {
    expect(PortfolioSnapshotSchema.safeParse(validPortfolio).success).toBe(true);
  });

  it("rejects inconsistent equity high-water and drawdown values", () => {
    const result = PortfolioSnapshotSchema.safeParse({
      ...validPortfolio,
      highWaterMarkUsd: 90,
      currentDrawdownPct: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed timestamps", () => {
    const result = PortfolioSnapshotSchema.safeParse({
      ...validPortfolio,
      timestamp: "not-a-timestamp",
    });
    expect(result.success).toBe(false);
  });
});
