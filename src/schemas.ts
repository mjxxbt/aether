import { z } from "zod";

// ---------------------------------------------------------------------------
// RiskGoals
// ---------------------------------------------------------------------------

export const RiskGoalsSchema = z.object({
  profile: z
    .string({ required_error: "goals.profile is required (e.g. 'aggressive')" })
    .trim()
    .min(1, "goals.profile must not be empty"),
  maxDrawdownPct: z
    .number({ required_error: "goals.maxDrawdownPct is required" })
    .finite()
    .gt(0, "goals.maxDrawdownPct must be > 0 (e.g. 0.08 for 8%)")
    .lte(1, "goals.maxDrawdownPct must be ≤ 1"),
  maxPositionPct: z
    .number({ required_error: "goals.maxPositionPct is required" })
    .finite()
    .gte(0, "goals.maxPositionPct must be ≥ 0")
    .lte(1, "goals.maxPositionPct must be ≤ 1"),
  maxOnchainExposurePct: z
    .number({ required_error: "goals.maxOnchainExposurePct is required" })
    .finite()
    .gte(0, "goals.maxOnchainExposurePct must be ≥ 0")
    .lte(1, "goals.maxOnchainExposurePct must be ≤ 1"),
  maxLeverage: z
    .number({ required_error: "goals.maxLeverage is required" })
    .finite()
    .gte(0, "goals.maxLeverage must be ≥ 0"),
  minConfidence: z
    .number({ required_error: "goals.minConfidence is required" })
    .finite()
    .gte(0, "goals.minConfidence must be ≥ 0")
    .lte(1, "goals.minConfidence must be ≤ 1"),
  reviewIntervalHours: z
    .number({ required_error: "goals.reviewIntervalHours is required" })
    .finite()
    .gt(0, "goals.reviewIntervalHours must be > 0"),
  momentum: z
    .object({
      shortWindow: z.number().finite().int().gt(0).optional(),
      strongDivergencePct: z.number().finite().gt(0).optional(),
      rsiOverextendedThreshold: z.number().finite().gte(0).lte(100).optional(),
    })
    .optional(),
  onchainCooldownHours: z.number().finite().gte(0).optional(),
  targetAllocation: z
    .record(z.number().finite().min(0).max(1))
    .superRefine((allocation, ctx) => {
      const total = Object.values(allocation).reduce((sum, value) => sum + value, 0);
      if (total > 1.000001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "targetAllocation percentages must sum to 1.0 or less",
        });
      }
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// PortfolioSnapshot
// ---------------------------------------------------------------------------

const PositionSnapshotSchema = z.object({
  symbol: z.string().trim().min(1),
  venue: z.enum(["spot", "margin", "usdm_futures", "coinm_futures", "onchain", "transfer"]),
  sizeUsd: z.number().finite().gte(0),
  unrealizedPnlUsd: z.number().finite(),
  leverage: z.number().finite().gte(0).optional(),
});

const VenueBalancesUsdSchema = z.object({
  spotUsd: z.number().finite().gte(0),
  marginUsd: z.number().finite().gte(0),
  usdmFuturesUsd: z.number().finite().gte(0),
  coinmFuturesUsd: z.number().finite().gte(0),
});

export const PortfolioSnapshotSchema = z
  .object({
    timestamp: z.string({ required_error: "portfolio.timestamp is required (ISO 8601)" }).datetime({ offset: true }),
    totalEquityUsd: z
      .number({ required_error: "portfolio.totalEquityUsd is required" })
      .finite()
      .gte(0, "portfolio.totalEquityUsd must be >= 0"),
    highWaterMarkUsd: z.number().finite().gte(0),
    currentDrawdownPct: z.number().finite().gte(0).lte(1),
    positions: z.array(PositionSnapshotSchema),
    portfolioMode: z.enum(["live", "paper"]).optional(),
    executionContext: z.enum(["mcp_live", "demo"]).optional(),
    availableBalancesUsd: VenueBalancesUsdSchema.optional(),
    spotAssetBalancesUsd: z.record(z.number().finite().gte(0)).optional(),
  })
  .superRefine((portfolio, ctx) => {
    if (portfolio.highWaterMarkUsd < portfolio.totalEquityUsd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highWaterMarkUsd"],
        message: "highWaterMarkUsd must be at least totalEquityUsd",
      });
    }
    const expectedDrawdown =
      portfolio.highWaterMarkUsd > 0
        ? (portfolio.highWaterMarkUsd - portfolio.totalEquityUsd) / portfolio.highWaterMarkUsd
        : 0;
    if (Math.abs(expectedDrawdown - portfolio.currentDrawdownPct) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentDrawdownPct"],
        message: "currentDrawdownPct does not match highWaterMarkUsd and totalEquityUsd",
      });
    }
  });

// ---------------------------------------------------------------------------
// MarketSnapshot + Kline
// ---------------------------------------------------------------------------

const KlineSchema = z
  .object({
    openTime: z.string().datetime({ offset: true }),
    open: z.number().finite().gt(0),
    high: z.number().finite().gt(0),
    low: z.number().finite().gt(0),
    close: z.number().finite().gt(0),
    volume: z.number().finite().gte(0),
  })
  .refine(
    (k) => k.low <= Math.min(k.open, k.close) && k.high >= Math.max(k.open, k.close),
    "Candle OHLC prices are inconsistent",
  );

const MarketSnapshotSchema = z.object({
  symbol: z.string(),
  priceUsd: z.number().finite().gt(0),
  change24hPct: z.number().finite().optional(),
  volume24hUsd: z.number().finite().gte(0).optional(),
  fundingRate: z.number().finite().optional(),
  basisPct: z.number().finite().optional(),
  klines: z.array(KlineSchema).optional(),
  executionConstraints: z
    .object({
      minNotionalUsd: z.number().finite().gt(0).optional(),
      minQuantity: z.number().finite().gt(0).optional(),
      quantityStepSize: z.number().finite().gt(0).optional(),
      priceTickSize: z.number().finite().gt(0).optional(),
      contractSize: z.number().finite().gt(0).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// OnchainCandidate
// ---------------------------------------------------------------------------

const OnchainCandidateSchema = z.object({
  chain: z.string(),
  address: z.string(),
  symbol: z.string(),
  auditPassed: z.boolean(),
  liquidityUsd: z.number().finite().gte(0),
  holderCount: z.number().finite().int().gte(0).optional(),
  trendScore: z.number().finite().gte(0).lte(1).optional(),
});

// ---------------------------------------------------------------------------
// PredictionMarketSnapshot
// ---------------------------------------------------------------------------

const PredictionMarketSnapshotSchema = z
  .object({
    marketId: z.string(),
    question: z.string(),
    yesProbability: z.number().finite().gt(0).lte(1),
    noProbability: z.number().finite().gt(0).lte(1),
    yesPriceUsd: z.number().finite().gt(0).lte(1),
    noPriceUsd: z.number().finite().gt(0).lte(1),
    resolutionDate: z.string().datetime({ offset: true }),
    liquidityUsd: z.number().finite().gte(0),
    category: z.enum(["crypto_price", "macro", "defi", "other"]),
  })
  .refine(
    (market) => Math.abs(market.yesProbability + market.noProbability - 1) <= 0.02,
    "yesProbability and noProbability must sum to approximately 1",
  );

// ---------------------------------------------------------------------------
// StrategyInput (the --scenario argument)
// ---------------------------------------------------------------------------

export const StrategyInputSchema = z
  .object({
    goals: RiskGoalsSchema.optional(),
    portfolio: PortfolioSnapshotSchema.optional(),
    markets: z
      .array(MarketSnapshotSchema)
      .min(1, "scenario.markets must contain at least one market snapshot")
      .optional(),
    portfolioSource: z.enum(["binance_mcp", "public_rest", "scenario", "offline"]).optional(),
    portfolioMode: z.enum(["live", "paper"]).optional(),
    executionContext: z.enum(["mcp_live", "demo"]).optional(),
    onchainCandidates: z.array(OnchainCandidateSchema).optional(),
    predictionMarkets: z.array(PredictionMarketSnapshotSchema).optional(),
  })
  .superRefine((input, ctx) => {
    const source = input.portfolioSource ?? "scenario";
    const expectedContext = source === "binance_mcp" ? "mcp_live" : "demo";
    if (
      source === "binance_mcp" &&
      (input.executionContext !== "mcp_live" ||
        !input.portfolioMode ||
        !input.portfolio?.availableBalancesUsd ||
        !input.portfolio?.spotAssetBalancesUsd)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["portfolioSource"],
        message:
          "MCP scenarios require explicit executionContext, portfolioMode, availableBalancesUsd, and spotAssetBalancesUsd. Source labels alone do not establish provenance.",
      });
    }
    if (input.executionContext && input.executionContext !== expectedContext) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["executionContext"],
        message: `portfolioSource '${source}' requires executionContext '${expectedContext}'`,
      });
    }
    if (source !== "binance_mcp" && input.portfolioMode === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["portfolioMode"],
        message: "Only a Binance MCP portfolio can use live execution mode",
      });
    }
  });

// ---------------------------------------------------------------------------
// TradeRecord (the --trade argument)
// ---------------------------------------------------------------------------

export const TradeRecordSchema = z.object({
  id: z.string().trim().min(1).optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  strategy: z.enum([
    "funding_rate",
    "funding_rate_neutral",
    "momentum",
    "onchain_alpha",
    "convert_yield",
    "prediction_market",
    "portfolio_rebalance",
    "sentiment",
  ]),
  symbol: z.string().trim().min(1),
  direction: z.enum(["long", "short", "buy", "sell", "hold"]),
  venue: z.enum(["spot", "margin", "usdm_futures", "coinm_futures", "onchain", "transfer"]),
  sizeUsd: z.number().finite().gt(0),
  confidence: z.number().finite().gte(0).lte(1),
  outcome: z.enum(["win", "loss", "breakeven", "open"]).optional(),
  pnlUsd: z.number().finite().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Validation helper — formats zod issues into a clear human-readable string
// ---------------------------------------------------------------------------

export function formatZodError(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
}

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for ${label}:\n${formatZodError(result.error.issues)}`);
  }
  return result.data;
}
