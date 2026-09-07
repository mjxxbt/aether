import { MarketSnapshot, Opportunity, StrategyInput } from "../types";
import { scoreFunding, NORMAL_FUNDING_BAND } from "./fundingRate";

function evaluateMarket(m: MarketSnapshot, maxPositionUsd: number): Opportunity | null {
  if (m.fundingRate === undefined) return null;
  const confidence = scoreFunding(m.fundingRate);
  if (confidence <= 0) return null;

  const perpDirection: "short" | "long" = m.fundingRate > 0 ? "short" : "long";
  const spotDirection: "buy" | "sell" = m.fundingRate > 0 ? "buy" : "sell";
  const ratePct = (m.fundingRate * 100).toFixed(4);
  const sizeUsd = Number((maxPositionUsd * confidence).toFixed(2));

  return {
    strategy: "funding_rate_neutral",
    symbol: m.symbol,
    direction: perpDirection,
    venue: "usdm_futures",
    confidence: Number(confidence.toFixed(3)),
    rationale:
      `${m.symbol} funding rate is ${ratePct}% per interval ` +
      `(normal band ±${(NORMAL_FUNDING_BAND * 100).toFixed(3)}%). ` +
      `Delta-neutral pair: ${perpDirection} the perp + ${spotDirection} equal spot ` +
      `notional to hedge price risk and isolate the funding edge.`,
    suggestedSizeUsd: sizeUsd,
    pairedLeg: {
      symbol: m.symbol,
      direction: spotDirection,
      venue: "spot",
      sizeUsd,
      rationale:
        `Spot hedge leg: ${spotDirection} $${sizeUsd.toFixed(2)} of ${m.symbol} ` +
        `spot to offset the perp directional exposure. ` +
        `Confirm spot liquidity before submitting.`,
    },
  };
}

export function runFundingRateNeutralStrategy(input: StrategyInput): Opportunity[] {
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;
  return input.markets
    .map((m) => evaluateMarket(m, maxPositionUsd))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);
}
