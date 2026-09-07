import { MarketSnapshot, Opportunity, StrategyInput } from "../types";

const FLAT_MOVEMENT_THRESHOLD = 0.005; // ±0.5% in 24h counted as "idle"
const BASE_CONFIDENCE = 0.35;
const TRANSFER_FUNDING_THRESHOLD = 0.0003; // 0.03%/interval suggests futures worth enabling

function evaluateYieldNudge(m: MarketSnapshot, maxPositionUsd: number): Opportunity | null {
  if (m.change24hPct === undefined) return null;
  if (Math.abs(m.change24hPct) > FLAT_MOVEMENT_THRESHOLD) return null;

  return {
    strategy: "convert_yield",
    symbol: m.symbol,
    direction: "hold",
    venue: "spot",
    confidence: BASE_CONFIDENCE,
    rationale:
      `${m.symbol} has moved only ${(m.change24hPct * 100).toFixed(2)}% in 24h — ` +
      `idle capital candidate for a Convert-based rebalance into a higher-yield ` +
      `instrument. This is an observation only; the agent must confirm a concrete ` +
      `Convert product and rate before any action.`,
    suggestedSizeUsd: Number((maxPositionUsd * BASE_CONFIDENCE * 0.5).toFixed(2)),
    raw: { type: "yield_review", requiresExternalProductQuote: true },
  };
}

function evaluateTransfer(input: StrategyInput, maxPositionUsd: number): Opportunity | null {
  // Only propose transfer if the portfolio has no futures positions at all
  const hasFuturesPosition = input.portfolio.positions.some(
    (p) => p.venue === "usdm_futures" || p.venue === "coinm_futures",
  );
  if (hasFuturesPosition) return null;
  if ((input.portfolio.availableBalancesUsd?.usdmFuturesUsd ?? 0) >= 5) return null;

  // Look for a market with meaningful funding rate that would benefit from futures access
  const candidate = input.markets.find(
    (m) => m.fundingRate !== undefined && Math.abs(m.fundingRate) >= TRANSFER_FUNDING_THRESHOLD,
  );
  if (!candidate || candidate.fundingRate === undefined) return null;

  const requestedTransferUsd = Math.min(maxPositionUsd, input.portfolio.totalEquityUsd * 0.25);
  const spotBalance = input.portfolio.availableBalancesUsd?.spotUsd;
  if (input.portfolio.portfolioMode !== "paper" && spotBalance !== undefined && spotBalance <= 0) {
    return null;
  }
  const transferSizeUsd =
    spotBalance === undefined ? requestedTransferUsd : Math.min(requestedTransferUsd, spotBalance * 0.999);
  if (transferSizeUsd <= 0) return null;

  return {
    strategy: "convert_yield",
    symbol: "USDT",
    direction: "buy",
    venue: "transfer",
    confidence: BASE_CONFIDENCE,
    rationale:
      `${candidate.symbol} has a funding rate of ${(candidate.fundingRate * 100).toFixed(4)}%/interval ` +
      `but no USDⓈ-M Futures wallet is funded. Proposing an internal Spot→Futures ` +
      `transfer to enable the funding_rate strategy. Resolve the current ` +
      `Binance MCP transfer tool and schema with tool_search before confirmation.`,
    suggestedSizeUsd: Number(transferSizeUsd.toFixed(2)),
    raw: {
      fromAccountType: "SPOT",
      toAccountType: "UMFUTURE",
      asset: "USDT",
      triggerSymbol: candidate.symbol,
    },
  };
}

export function runConvertYieldStrategy(input: StrategyInput): Opportunity[] {
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;

  const yieldNudges = input.markets
    .map((m) => evaluateYieldNudge(m, maxPositionUsd))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);

  const transferOpp = evaluateTransfer(input, maxPositionUsd);
  const transfers: Opportunity[] = transferOpp ? [transferOpp] : [];

  return [...yieldNudges, ...transfers];
}
