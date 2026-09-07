import { MarketSnapshot, Opportunity, StrategyInput } from "../types";

export const NORMAL_FUNDING_BAND = 0.0003; // ~0.03% per interval treated as "normal"
export const EXTREME_FUNDING = 0.0015; // ~0.15% treated as extreme -> confidence caps here

export function scoreFunding(rate: number): number {
  const magnitude = Math.abs(rate);
  if (magnitude <= NORMAL_FUNDING_BAND) return 0;
  const clamped = Math.min(magnitude, EXTREME_FUNDING);
  return (clamped - NORMAL_FUNDING_BAND) / (EXTREME_FUNDING - NORMAL_FUNDING_BAND);
}

function evaluateMarket(m: MarketSnapshot, maxPositionUsd: number): Opportunity | null {
  if (m.fundingRate === undefined) return null;
  const confidence = scoreFunding(m.fundingRate);
  if (confidence <= 0) return null;

  // Positive funding: longs pay shorts -> bias short the perp.
  // Negative funding: shorts pay longs -> bias long the perp.
  const direction = m.fundingRate > 0 ? "short" : "long";
  const ratePct = (m.fundingRate * 100).toFixed(4);

  return {
    strategy: "funding_rate",
    symbol: m.symbol,
    direction,
    venue: "usdm_futures",
    confidence: Number(confidence.toFixed(3)),
    rationale:
      `${m.symbol} funding rate is ${ratePct}% per interval, ` +
      `${m.fundingRate > 0 ? "above" : "below"} the normal band ` +
      `(±${(NORMAL_FUNDING_BAND * 100).toFixed(3)}%). Biasing ${direction} on the ` +
      `perpetual to collect the funding edge.`,
    suggestedSizeUsd: Number((maxPositionUsd * confidence).toFixed(2)),
  };
}

export function runFundingRateStrategy(input: StrategyInput): Opportunity[] {
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;
  return input.markets
    .map((m) => evaluateMarket(m, maxPositionUsd))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);
}
