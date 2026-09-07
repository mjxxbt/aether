import { Opportunity, PredictionMarketSnapshot, StrategyInput } from "../types";

const MIN_LIQUIDITY_USD = 50_000;
const MIN_EDGE = 0.05; // 5% edge required
const MIN_PROB = 0.1; // skip near-0 (or near-1) probability markets
const MAX_PROB = 0.9;

function daysUntilResolution(resolutionDate: string): number {
  const ms = new Date(resolutionDate).getTime() - Date.now();
  return ms / (1000 * 60 * 60 * 24);
}

function evaluateMarket(pm: PredictionMarketSnapshot, maxPositionUsd: number): Opportunity | null {
  // Hard gates
  if (pm.liquidityUsd < MIN_LIQUIDITY_USD) return null;
  const daysLeft = daysUntilResolution(pm.resolutionDate);
  if (!Number.isFinite(daysLeft) || daysLeft <= 0) return null; // invalid or resolved
  if (pm.yesProbability < MIN_PROB || pm.yesProbability > MAX_PROB) return null;

  // Edge calculation vs naive fair-value baseline
  const edgeYes = (pm.yesProbability - pm.yesPriceUsd) / pm.yesProbability;
  const edgeNo = (pm.noProbability - pm.noPriceUsd) / pm.noProbability;

  const bestEdge = Math.max(edgeYes, edgeNo);
  if (bestEdge < MIN_EDGE) return null;

  const outcome: "YES" | "NO" = edgeYes >= edgeNo ? "YES" : "NO";
  const edgePct = (bestEdge * 100).toFixed(1);
  const confidence = Math.min(1, bestEdge * 4); // 25% edge => confidence 1.0

  return {
    strategy: "prediction_market",
    symbol: pm.marketId,
    // The edge is always expressed as buying the underpriced outcome. The
    // YES/NO choice is carried explicitly in raw for the wallet adapter.
    direction: "buy",
    venue: "onchain",
    confidence: Number(confidence.toFixed(3)),
    rationale:
      `Prediction market "${pm.question}": YES @ $${pm.yesPriceUsd} ` +
      `(implied prob ${(pm.yesProbability * 100).toFixed(1)}%), ` +
      `NO @ $${pm.noPriceUsd}. ` +
      `Best edge: ${edgePct}% on the ${outcome} side. ` +
      `Resolves in ${daysLeft.toFixed(1)} days. ` +
      `$${pm.liquidityUsd.toLocaleString()} liquidity. ` +
      `Route via Agentic Wallet.`,
    suggestedSizeUsd: Number((maxPositionUsd * confidence).toFixed(2)),
    raw: {
      marketId: pm.marketId,
      question: pm.question,
      edgeYes,
      edgeNo,
      daysLeft,
      outcome,
      yesPriceUsd: pm.yesPriceUsd,
      noPriceUsd: pm.noPriceUsd,
      resolutionDate: pm.resolutionDate,
    },
  };
}

export function runPredictionMarketStrategy(input: StrategyInput): Opportunity[] {
  if (!input.predictionMarkets || input.predictionMarkets.length === 0) return [];
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;

  return input.predictionMarkets
    .map((pm) => evaluateMarket(pm, maxPositionUsd))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);
}
