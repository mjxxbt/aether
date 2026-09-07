import { MemoryState, OnchainCandidate, Opportunity, StrategyInput } from "../types";

const MIN_LIQUIDITY_USD = 250_000;
const DEFAULT_COOLDOWN_HOURS = 12;

function tierMultiplier(liquidity: number, holderCount: number | undefined): number {
  const holders = holderCount ?? 0;
  if (liquidity > 5_000_000 && holders > 5_000) return 1.0; // Tier 3
  if (liquidity > 1_000_000 || holders > 2_000) return 0.6; // Tier 2
  return 0.3; // Tier 1
}

function isCoolingDown(address: string, memory: MemoryState, cooldownHours: number): boolean {
  const cooldowns = memory.onchainCooldowns ?? {};
  const ts = cooldowns[address];
  if (!ts) return false;
  const rejectedAt = new Date(ts).getTime();
  const cooldownMs = cooldownHours * 3600 * 1000;
  return Date.now() - rejectedAt < cooldownMs;
}

function evaluateCandidate(
  c: OnchainCandidate,
  maxOnchainUsd: number,
  memory: MemoryState,
  cooldownHours: number,
): Opportunity | null {
  if (!c.auditPassed) return null;
  if (c.liquidityUsd < MIN_LIQUIDITY_USD) return null;

  const trend = c.trendScore ?? 0;
  if (trend <= 0) return null;

  if (isCoolingDown(c.address, memory, cooldownHours)) return null;

  const mult = tierMultiplier(c.liquidityUsd, c.holderCount);
  const confidence = Math.min(1, trend);
  const tierLabel = mult === 1.0 ? "Tier 3 (Established)" : mult === 0.6 ? "Tier 2 (Growing)" : "Tier 1 (Micro)";

  return {
    strategy: "onchain_alpha",
    symbol: c.symbol,
    direction: "buy",
    venue: "onchain",
    confidence: Number(confidence.toFixed(3)),
    rationale:
      `${c.symbol} on ${c.chain} passed audit checks with ` +
      `$${c.liquidityUsd.toLocaleString()} liquidity, ` +
      `${c.holderCount?.toLocaleString() ?? "unknown"} holders — ` +
      `classified as ${tierLabel} (size multiplier ${mult}). ` +
      `Trend score: ${trend.toFixed(2)}. Gated entry via Agentic Wallet.`,
    suggestedSizeUsd: Number((maxOnchainUsd * mult * confidence).toFixed(2)),
    raw: { chain: c.chain, address: c.address, holderCount: c.holderCount, tier: tierLabel },
  };
}

export function runOnchainAlphaStrategy(input: StrategyInput, memory: MemoryState): Opportunity[] {
  if (!input.onchainCandidates || input.onchainCandidates.length === 0) return [];
  const maxOnchainUsd = input.portfolio.totalEquityUsd * input.goals.maxOnchainExposurePct;

  const currentOnchainUsd = input.portfolio.positions
    .filter((p) => p.venue === "onchain")
    .reduce((sum, p) => sum + Math.abs(p.sizeUsd), 0);
  const remainingOnchainBudget = Math.max(0, maxOnchainUsd - currentOnchainUsd);
  if (remainingOnchainBudget <= 0) return [];

  const cooldownHours = input.goals.onchainCooldownHours ?? DEFAULT_COOLDOWN_HOURS;

  return input.onchainCandidates
    .map((c) => evaluateCandidate(c, remainingOnchainBudget, memory, cooldownHours))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);
}
