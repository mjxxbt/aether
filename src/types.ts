export type StrategyId =
  | "funding_rate"
  | "funding_rate_neutral"
  | "momentum"
  | "onchain_alpha"
  | "convert_yield"
  | "prediction_market"
  | "portfolio_rebalance"
  | "sentiment";

export interface RiskGoals {
  profile: string;
  maxDrawdownPct: number;
  maxPositionPct: number;
  maxOnchainExposurePct: number;
  maxLeverage: number;
  minConfidence: number;
  reviewIntervalHours: number;
  targetAllocation?: Record<string, number>;
  momentum?: {
    shortWindow?: number;
    strongDivergencePct?: number;
    rsiOverextendedThreshold?: number;
  };
  onchainCooldownHours?: number;
}

export interface PortfolioSnapshot {
  timestamp: string; // ISO 8601
  totalEquityUsd: number;
  highWaterMarkUsd: number;
  currentDrawdownPct: number;
  positions: PositionSnapshot[];
  /** The engine's execution mode for this snapshot. Paper mode can never write. */
  portfolioMode?: PortfolioMode;
  /** `mcp_live` only when the snapshot came from a real Binance MCP account. */
  executionContext?: ExecutionContext;
  /**
   * Sanitized collateral totals supplied by the connected account adapter.
   * These are intentionally aggregate values: no account ids or raw asset
   * rows belong in the engine.
   */
  availableBalancesUsd?: VenueBalancesUsd;
  /** USD-equivalent value of base assets that may be sold on Spot. */
  spotAssetBalancesUsd?: Record<string, number>;
}

export interface VenueBalancesUsd {
  spotUsd: number;
  marginUsd: number;
  usdmFuturesUsd: number;
  coinmFuturesUsd: number;
}

export type PortfolioSource = "binance_mcp" | "public_rest" | "scenario" | "offline";
export type PortfolioMode = "live" | "paper";
/** Explicitly distinguishes real connected Agent OS context from demo data. */
export type ExecutionContext = "mcp_live" | "demo";
/** Provenance of the signal itself; a real account may still receive demo signals. */
export type SignalContext = "agent_os" | "demo";

/** Sanitized provenance shown in the dashboard; never contains raw account rows. */
export interface AccountContextStatus {
  source: PortfolioSource;
  mode: PortfolioMode;
  executionContext: ExecutionContext;
  capturedAt: string;
  totalEquityUsd: number;
  highWaterMarkUsd: number;
  currentDrawdownPct: number;
  openPositions: number;
  availableBalancesUsd?: VenueBalancesUsd;
  spotAssetBalancesUsd?: Record<string, number>;
}

export interface PositionSnapshot {
  symbol: string;
  venue: "spot" | "margin" | "usdm_futures" | "coinm_futures" | "onchain" | "transfer";
  sizeUsd: number;
  unrealizedPnlUsd: number;
  leverage?: number;
}

export interface MarketSnapshot {
  symbol: string;
  priceUsd: number;
  change24hPct?: number;
  volume24hUsd?: number;
  fundingRate?: number;
  basisPct?: number;
  klines?: Kline[];
  /** Exchange filters may be injected by an MCP preflight adapter. */
  executionConstraints?: ExecutionConstraints;
}

export interface ExecutionConstraints {
  minNotionalUsd?: number;
  minQuantity?: number;
  quantityStepSize?: number;
  priceTickSize?: number;
  /** COIN-M USD notional represented by one contract. */
  contractSize?: number;
}

export interface Kline {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OnchainCandidate {
  chain: string;
  address: string;
  symbol: string;
  auditPassed: boolean;
  liquidityUsd: number;
  holderCount?: number;
  trendScore?: number; // 0-1 from a trending/meme-rush style skill
}

export interface PredictionMarketSnapshot {
  marketId: string;
  question: string;
  yesProbability: number;
  noProbability: number;
  yesPriceUsd: number;
  noPriceUsd: number;
  resolutionDate: string;
  liquidityUsd: number;
  category: "crypto_price" | "macro" | "defi" | "other";
}

export interface StrategyInput {
  goals: RiskGoals;
  portfolio: PortfolioSnapshot;
  markets: MarketSnapshot[];
  portfolioSource?: PortfolioSource;
  portfolioMode?: PortfolioMode;
  executionContext?: ExecutionContext;
  onchainCandidates?: OnchainCandidate[];
  predictionMarkets?: PredictionMarketSnapshot[];
}

export interface Opportunity {
  strategy: StrategyId;
  symbol: string;
  direction: "long" | "short" | "buy" | "sell" | "hold";
  venue: PositionSnapshot["venue"];
  confidence: number; // 0-1
  rationale: string;
  /** Demo adapters can inform paper proposals but can never authorize a live write. */
  signalContext?: SignalContext;
  suggestedSizeUsd: number;
  raw?: Record<string, unknown>;
  pairedLeg?: {
    symbol: string;
    direction: "long" | "short" | "buy" | "sell";
    venue: PositionSnapshot["venue"];
    sizeUsd: number;
    rationale: string;
    referencePriceUsd?: number;
    executionConstraints?: ExecutionConstraints;
  };
}

export interface SizedOpportunity extends Opportunity {
  approved: boolean;
  finalSizeUsd: number;
  rejectionReason?: string;
  riskNotes: string[];
  stopPricePct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  /** Price used to derive the absolute protection levels. */
  referencePriceUsd?: number;
  /** Exchange filters captured during the read-only market preflight. */
  executionConstraints?: ExecutionConstraints;
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  strategy: StrategyId;
  symbol: string;
  direction: Opportunity["direction"];
  venue: PositionSnapshot["venue"];
  sizeUsd: number;
  confidence: number;
  outcome?: "win" | "loss" | "breakeven" | "open";
  pnlUsd?: number;
  notes?: string;
}

export interface StrategyPerformance {
  strategy: StrategyId;
  trades: number;
  wins: number;
  losses: number;
  totalPnlUsd: number;
  winRate: number;
  weight: number;
  paused: boolean;
  bySymbol?: Record<string, SymbolPerformance>;
}

export interface SymbolPerformance {
  trades: number;
  wins: number;
  losses: number;
  totalPnlUsd: number;
}

export interface EquityCurvePoint {
  timestamp: string;
  totalEquityUsd: number;
  drawdownPct: number;
  /** Optional provenance added by newer scans; legacy points may omit these. */
  source?: PortfolioSource;
  mode?: PortfolioMode;
  executionContext?: ExecutionContext;
}

export interface MemoryState {
  goals?: RiskGoals;
  trades: TradeRecord[];
  performance: Record<StrategyId, StrategyPerformance>;
  lastUpdated: string;
  equityCurve?: EquityCurvePoint[];
  onchainCooldowns?: Record<string, string>;
  riskHalt?: {
    reason: string;
    timestamp: string;
  };
  accountContext?: AccountContextStatus;
}

export interface PendingAction {
  id: string;
  createdAt: string;
  expiresAt?: string;
  summary: string;
  opportunity: SizedOpportunity;
  status: "pending" | "confirmed" | "rejected" | "expired";
  /** Missing on legacy records; those records are treated as paper for safety. */
  executionMode?: PortfolioMode;
  /** Missing on legacy records; derived from executionMode during migration. */
  executionContext?: ExecutionContext;
}
