import { MemoryState, Opportunity, StrategyInput } from "../types";
import { runFundingRateStrategy } from "./fundingRate";
import { runFundingRateNeutralStrategy } from "./fundingRateNeutral";
import { runMomentumStrategy } from "./momentum";
import { runOnchainAlphaStrategy } from "./onchainAlpha";
import { runConvertYieldStrategy } from "./convertYield";
import { runPredictionMarketStrategy } from "./predictionMarket";
import { runPortfolioRebalanceStrategy } from "./portfolioRebalance";
import { runSentimentStrategy } from "./sentiment";

export function generateOpportunities(input: StrategyInput, memory: MemoryState): Opportunity[] {
  const all: Opportunity[] = [
    ...runFundingRateStrategy(input),
    ...runFundingRateNeutralStrategy(input),
    ...runMomentumStrategy(input),
    ...runOnchainAlphaStrategy(input, memory),
    ...runConvertYieldStrategy(input),
    ...runPredictionMarketStrategy(input),
    ...runPortfolioRebalanceStrategy(input),
    ...runSentimentStrategy(input),
  ];

  const weighted = all
    .map((o) => {
      const perf = memory.performance[o.strategy];
      if (!perf || perf.paused) return null;
      const adjusted = Math.min(1, o.confidence * perf.weight);
      return { ...o, confidence: Number(adjusted.toFixed(3)) };
    })
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);

  return weighted.sort((a, b) => b.confidence - a.confidence);
}
