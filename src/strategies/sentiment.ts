import { MarketSnapshot, Opportunity, StrategyInput } from "../types";

// Credential-free deterministic adapter used when the orchestrator does not
// provide a real news/social sentiment feed. It must not claim that external
// articles or posts were fetched.
function fetchDemoSentiment(symbol: string): { score: number; summary: string } {
  // Deterministic demo signal based on symbol length and first character code.
  const seed = symbol.charCodeAt(0) + symbol.length;

  // Normalize to a score between 0.2 and 0.9
  const score = 0.2 + (seed % 7) / 10;

  // Decide direction
  const isPositive = seed % 2 === 0;

  if (isPositive) {
    return {
      score,
      summary: `Deterministic demo sentiment adapter produced a positive signal; no external articles or posts were fetched.`,
    };
  } else {
    return {
      score,
      summary: `Deterministic demo sentiment adapter produced a negative signal; no external articles or posts were fetched.`,
    };
  }
}

export function runSentimentStrategy(input: StrategyInput): Opportunity[] {
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;

  const opportunities: Opportunity[] = [];
  // Keep the deterministic demo adapter bounded to the five most liquid
  // eligible markets, matching the strategy's stated scope.
  const candidates = input.markets
    .filter((market) => {
      const volume = market.volume24hUsd || 0;
      return volume >= 100_000_000 || market.symbol === "BTCUSDT" || market.symbol === "ETHUSDT";
    })
    .sort((left, right) => (right.volume24hUsd || 0) - (left.volume24hUsd || 0))
    .slice(0, 5);

  for (const m of candidates) {
    const { score, summary } = fetchDemoSentiment(m.symbol);

    // Only propose if sentiment is very strong (score > 0.6)
    if (score > 0.6) {
      const seed = m.symbol.charCodeAt(0) + m.symbol.length;
      const isPositive = seed % 2 === 0;

      const direction = isPositive ? "long" : "short";

      opportunities.push({
        strategy: "sentiment",
        symbol: m.symbol,
        direction,
        // A spot SELL is not a short entry. Route negative signals through
        // margin so the external agent can verify borrowing requirements.
        venue: isPositive ? "spot" : "margin",
        confidence: Number(score.toFixed(3)),
        signalContext: "demo",
        rationale: `Demo sentiment signal [Score: ${(score * 100).toFixed(0)}/100]: ${summary}`,
        suggestedSizeUsd: Number((maxPositionUsd * score).toFixed(2)),
        raw: { aiScore: score },
      });
    }
  }

  return opportunities.filter((o) => o.confidence >= input.goals.minConfidence);
}
