import { Opportunity, StrategyInput } from "../types";

const DRIFT_THRESHOLD = 0.05; // 5% drift tolerance

const QUOTE_ASSETS = ["USDT", "USDC", "BUSD", "USD"];

function baseAsset(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  const quote = QUOTE_ASSETS.find(
    (candidate) => normalized.endsWith(candidate) && normalized.length > candidate.length,
  );
  return quote ? normalized.slice(0, -quote.length) : normalized;
}

function spotPair(asset: string): string {
  const normalized = asset.trim().toUpperCase();
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
}

export function runPortfolioRebalanceStrategy(input: StrategyInput): Opportunity[] {
  if (!input.goals.targetAllocation) return [];
  if (!input.portfolio || input.portfolio.totalEquityUsd <= 0) return [];

  const opportunities: Opportunity[] = [];
  const targetAlloc = input.goals.targetAllocation;
  const totalUsd = input.portfolio.totalEquityUsd;

  // Aggregate gross exposure by base asset. This handles multiple venue
  // positions and both BTC and BTCUSDT target keys consistently.
  const currentByAsset = new Map<string, number>();
  for (const position of input.portfolio.positions) {
    if (position.venue === "transfer") continue;
    const asset = baseAsset(position.symbol);
    if (!asset) continue;
    currentByAsset.set(asset, (currentByAsset.get(asset) ?? 0) + Math.abs(position.sizeUsd));
  }

  for (const [asset, targetPct] of Object.entries(targetAlloc)) {
    const normalizedAsset = baseAsset(asset);
    const currentUsd = currentByAsset.get(normalizedAsset) ?? 0;
    const currentPct = currentUsd / totalUsd;

    const drift = currentPct - targetPct;

    if (Math.abs(drift) > DRIFT_THRESHOLD) {
      const targetUsd = totalUsd * targetPct;
      const differenceUsd = Math.abs(currentUsd - targetUsd);

      const direction = drift > 0 ? "sell" : "buy";
      const confidence = Math.min(1, Math.abs(drift) * 10); // 10% drift = 1.0 conf

      opportunities.push({
        strategy: "portfolio_rebalance",
        symbol: spotPair(asset),
        direction,
        venue: "spot",
        confidence: Number(confidence.toFixed(3)),
        rationale: `Portfolio drift detected for ${asset}. Target allocation is ${(targetPct * 100).toFixed(1)}%, but current is ${(currentPct * 100).toFixed(1)}%. Proposing ${direction} of $${differenceUsd.toFixed(2)} to rebalance.`,
        suggestedSizeUsd: Number(differenceUsd.toFixed(2)),
      });
    }
  }

  return opportunities;
}
