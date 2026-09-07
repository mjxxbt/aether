import { PortfolioSnapshot, PortfolioSource, StrategyInput } from "./types";

export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
export const PAPER_EQUITY_USD = 10_000;
export const DUST_EQUITY_USD = 5;

/** Source labels are an operator attestation, not cryptographic MCP evidence. */
export function validateMcpPortfolio(portfolio: PortfolioSnapshot): void {
  if (!portfolio.availableBalancesUsd || !portfolio.spotAssetBalancesUsd) {
    throw new Error("MCP handoff requires availableBalancesUsd and spotAssetBalancesUsd from read-only account data.");
  }
  const captured = Date.parse(portfolio.timestamp);
  if (!Number.isFinite(captured) || captured > Date.now() + 60_000 || Date.now() - captured >= SNAPSHOT_TTL_MS) {
    throw new Error("MCP portfolio is stale or has an invalid timestamp. Run a fresh read-only account scan.");
  }
}

export function normalizePortfolio(
  portfolio: PortfolioSnapshot,
  source: PortfolioSource,
  requestedMode?: "live" | "paper",
): Pick<StrategyInput, "portfolio" | "portfolioMode" | "executionContext"> {
  const executionContext = source === "binance_mcp" ? "mcp_live" : "demo";
  if (executionContext === "mcp_live") validateMcpPortfolio(portfolio);
  const available = portfolio.availableBalancesUsd;
  const usableUsd = available
    ? Object.values(available).reduce((sum, value) => sum + value, 0) +
      Object.values(portfolio.spotAssetBalancesUsd ?? {}).reduce((sum, value) => sum + value, 0)
    : portfolio.totalEquityUsd;
  const dust =
    portfolio.positions.length === 0 && (portfolio.totalEquityUsd < DUST_EQUITY_USD || usableUsd < DUST_EQUITY_USD);
  const portfolioMode =
    executionContext === "demo" || requestedMode === "paper" || portfolio.portfolioMode === "paper" || dust
      ? "paper"
      : "live";
  return {
    executionContext,
    portfolioMode,
    portfolio: {
      ...portfolio,
      portfolioMode,
      executionContext,
      ...(dust ? { totalEquityUsd: PAPER_EQUITY_USD, highWaterMarkUsd: PAPER_EQUITY_USD, currentDrawdownPct: 0 } : {}),
    },
  };
}
