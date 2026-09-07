import { RiskGoals } from "../types";

export type RiskProfileId = "capital_preservation" | "conservative" | "balanced" | "growth" | "aggressive";

export interface RiskProfileDefinition {
  id: RiskProfileId;
  label: string;
  description: string;
  goals: RiskGoals;
}

const profile = (
  id: RiskProfileId,
  label: string,
  description: string,
  values: Omit<RiskGoals, "profile">,
): RiskProfileDefinition => ({
  id,
  label,
  description,
  goals: { profile: id, ...values },
});

export const RISK_PROFILES: Record<RiskProfileId, RiskProfileDefinition> = {
  capital_preservation: profile(
    "capital_preservation",
    "Capital Preservation",
    "Lowest risk. Prioritizes protecting capital and requires strong signals.",
    {
      maxDrawdownPct: 0.02,
      maxPositionPct: 0.05,
      maxOnchainExposurePct: 0,
      maxLeverage: 1,
      minConfidence: 0.7,
      reviewIntervalHours: 1,
      onchainCooldownHours: 24,
    },
  ),
  conservative: profile(
    "conservative",
    "Conservative",
    "Low risk. Favors smaller positions, limited leverage, and fewer trades.",
    {
      maxDrawdownPct: 0.05,
      maxPositionPct: 0.1,
      maxOnchainExposurePct: 0,
      maxLeverage: 1,
      minConfidence: 0.55,
      reviewIntervalHours: 4,
      onchainCooldownHours: 18,
    },
  ),
  balanced: profile("balanced", "Balanced", "Moderate risk. A general-purpose profile for diversified strategies.", {
    maxDrawdownPct: 0.08,
    maxPositionPct: 0.15,
    maxOnchainExposurePct: 0.05,
    maxLeverage: 2,
    minConfidence: 0.4,
    reviewIntervalHours: 4,
    onchainCooldownHours: 12,
  }),
  growth: profile("growth", "Growth", "Higher risk. Allows larger positions and broader strategy participation.", {
    maxDrawdownPct: 0.12,
    maxPositionPct: 0.2,
    maxOnchainExposurePct: 0.1,
    maxLeverage: 3,
    minConfidence: 0.3,
    reviewIntervalHours: 6,
    onchainCooldownHours: 12,
  }),
  aggressive: profile(
    "aggressive",
    "Aggressive",
    "Highest risk. For experienced users who accept larger drawdowns and leverage.",
    {
      maxDrawdownPct: 0.2,
      maxPositionPct: 0.3,
      maxOnchainExposurePct: 0.2,
      maxLeverage: 5,
      minConfidence: 0.25,
      reviewIntervalHours: 12,
      onchainCooldownHours: 8,
    },
  ),
};

export const RISK_PROFILE_LIST = Object.values(RISK_PROFILES);

export function getRiskProfile(id: string): RiskProfileDefinition | undefined {
  return RISK_PROFILES[id as RiskProfileId];
}
