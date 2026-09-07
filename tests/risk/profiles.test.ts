import { RISK_PROFILE_LIST } from "../../src/risk/profiles";

describe("risk profiles", () => {
  it("provides five ordered selectable profiles", () => {
    expect(RISK_PROFILE_LIST).toHaveLength(5);
    expect(RISK_PROFILE_LIST.map((profile) => profile.id)).toEqual([
      "capital_preservation",
      "conservative",
      "balanced",
      "growth",
      "aggressive",
    ]);
  });

  it("keeps every profile inside valid risk ranges", () => {
    for (const profile of RISK_PROFILE_LIST) {
      expect(profile.goals.maxDrawdownPct).toBeGreaterThan(0);
      expect(profile.goals.maxPositionPct).toBeGreaterThanOrEqual(0);
      expect(profile.goals.maxPositionPct).toBeLessThanOrEqual(1);
      expect(profile.goals.maxOnchainExposurePct).toBeGreaterThanOrEqual(0);
      expect(profile.goals.maxOnchainExposurePct).toBeLessThanOrEqual(1);
      expect(profile.goals.minConfidence).toBeGreaterThanOrEqual(0);
      expect(profile.goals.minConfidence).toBeLessThanOrEqual(1);
    }
  });
});
