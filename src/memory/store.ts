import * as fs from "fs";
import {
  EquityCurvePoint,
  MemoryState,
  AccountContextStatus,
  PortfolioSnapshot,
  RiskGoals,
  StrategyId,
  StrategyPerformance,
  SymbolPerformance,
  TradeRecord,
} from "../types";

import { PATHS } from "../config/paths";
import { writeJsonAtomic } from "../config/persistence";

const DEFAULT_MEMORY_PATH = PATHS.MEMORY;

export const ALL_STRATEGIES: StrategyId[] = [
  "funding_rate",
  "funding_rate_neutral",
  "momentum",
  "onchain_alpha",
  "convert_yield",
  "prediction_market",
  "portfolio_rebalance",
  "sentiment",
];

function emptyPerformance(strategy: StrategyId): StrategyPerformance {
  return {
    strategy,
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnlUsd: 0,
    winRate: 0,
    weight: 1,
    paused: false,
    bySymbol: {},
  };
}

function emptyState(): MemoryState {
  const performance = {} as Record<StrategyId, StrategyPerformance>;
  for (const s of ALL_STRATEGIES) performance[s] = emptyPerformance(s);
  return {
    trades: [],
    performance,
    lastUpdated: new Date().toISOString(),
    equityCurve: [],
    onchainCooldowns: {},
  };
}

export class MemoryStore {
  private filePath: string;

  constructor(storePath: string = PATHS.MEMORY) {
    this.filePath = storePath;
  }

  load(): MemoryState {
    if (!fs.existsSync(this.filePath)) {
      const fresh = emptyState();
      this.save(fresh);
      return fresh;
    }
    const raw = fs.readFileSync(this.filePath, "utf-8");
    try {
      const parsed = JSON.parse(raw) as MemoryState;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.trades) ||
        !parsed.performance ||
        typeof parsed.performance !== "object"
      ) {
        throw new Error("expected an object with trades[] and performance");
      }
      // backfill any strategies added after the file was first created
      for (const s of ALL_STRATEGIES) {
        if (!parsed.performance[s]) parsed.performance[s] = emptyPerformance(s);
        // backfill bySymbol if missing (migration from older format)
        if (!parsed.performance[s].bySymbol) parsed.performance[s].bySymbol = {};
      }
      if (!Array.isArray(parsed.equityCurve)) parsed.equityCurve = [];
      if (!parsed.onchainCooldowns || typeof parsed.onchainCooldowns !== "object") {
        parsed.onchainCooldowns = {};
      }
      let contextMigrated = false;
      if (parsed.accountContext) {
        const expectedContext = parsed.accountContext.source === "binance_mcp" ? "mcp_live" : "demo";
        if (parsed.accountContext.executionContext !== expectedContext) {
          parsed.accountContext.executionContext = expectedContext;
          contextMigrated = true;
        }
        if (expectedContext === "demo" && parsed.accountContext.mode === "live") {
          // A non-MCP snapshot cannot be promoted to a live execution source.
          parsed.accountContext.mode = "paper";
          contextMigrated = true;
        }
      }
      if (contextMigrated) this.save(parsed);
      return parsed;
    } catch (err) {
      throw new Error(`Aether memory file at ${this.filePath} is corrupt or unreadable: ${(err as Error).message}`);
    }
  }

  save(state: MemoryState): void {
    state.lastUpdated = new Date().toISOString();
    writeJsonAtomic(this.filePath, state);
  }

  setGoals(goals: RiskGoals): MemoryState {
    const state = this.load();
    state.goals = goals;
    this.save(state);
    return state;
  }

  recordTrade(trade: TradeRecord): MemoryState {
    const state = this.load();
    const previous = state.trades.find((t) => t.id === trade.id);
    if (previous) {
      if (previous.outcome === "open" && trade.outcome && trade.outcome !== "open") {
        const immutable = ["strategy", "symbol", "direction", "venue", "sizeUsd", "confidence"] as const;
        if (immutable.some((key) => previous[key] !== trade[key]))
          throw new Error(`Trade ID ${trade.id} already exists with different entry fields.`);
        Object.assign(previous, trade);
        recomputePerformanceState(state);
        this.save(state);
        return state;
      }
      const { timestamp: _oldTime, ...oldFields } = previous;
      const { timestamp: _newTime, ...newFields } = trade;
      if (JSON.stringify(oldFields) !== JSON.stringify(newFields)) {
        throw new Error(
          `Trade ID ${trade.id} already exists with different fields. Use the original record or a new ID for a different trade.`,
        );
      }
      return state;
    }
    state.trades.push(trade);
    recomputePerformanceState(state);
    this.save(state);
    return state;
  }

  appendEquityCurve(portfolio: PortfolioSnapshot, source?: AccountContextStatus["source"]): MemoryState {
    const state = this.load();
    if (!state.equityCurve) state.equityCurve = [];
    const point: EquityCurvePoint = {
      timestamp: new Date().toISOString(),
      totalEquityUsd: portfolio.totalEquityUsd,
      drawdownPct: portfolio.currentDrawdownPct,
      ...(source ? { source } : {}),
      mode: portfolio.portfolioMode ?? "paper",
      ...(portfolio.executionContext ? { executionContext: portfolio.executionContext } : {}),
    };
    state.equityCurve.push(point);
    this.save(state);
    return state;
  }

  recordOnchainCooldown(address: string): MemoryState {
    const state = this.load();
    if (!state.onchainCooldowns) state.onchainCooldowns = {};
    state.onchainCooldowns[address] = new Date().toISOString();
    this.save(state);
    return state;
  }

  recordAccountContext(context: AccountContextStatus): MemoryState {
    const state = this.load();
    state.accountContext = context;
    this.save(state);
    return state;
  }

  recomputePerformance(): MemoryState {
    const state = this.load();
    recomputePerformanceState(state);
    this.save(state);
    return state;
  }

  resetStrategy(strategy: StrategyId): MemoryState {
    const state = this.load();
    // Reset means the strategy's learning history is cleared as well as its
    // derived counters. Keeping old trades would make the next recompute
    // immediately restore the paused/underperforming state.
    state.trades = state.trades.filter((trade) => trade.strategy !== strategy);
    state.performance[strategy] = emptyPerformance(strategy);
    this.save(state);
    return state;
  }
}

/** Recompute derived strategy statistics without touching the filesystem. */
export function recomputePerformanceState(state: MemoryState): MemoryState {
  for (const strategy of ALL_STRATEGIES) {
    const closed = state.trades.filter((t) => t.strategy === strategy && t.outcome && t.outcome !== "open");
    const wins = closed.filter((t) => t.outcome === "win").length;
    const losses = closed.filter((t) => t.outcome === "loss").length;
    const totalPnlUsd = closed.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);

    // Dynamic weight with consecutive-loss streak detection
    let weight = 1;
    let consecutiveLosses = 0;
    for (const t of closed) {
      if (t.outcome === "win") {
        weight += 0.05;
        consecutiveLosses = 0;
      } else if (t.outcome === "loss") {
        weight -= 0.08;
        consecutiveLosses += 1;
      }
    }
    weight = Math.min(1.5, Math.max(0.1, weight));
    const paused = consecutiveLosses >= 3;
    if (paused) weight = 0;

    // Per-symbol breakdown (Phase 1.6)
    const bySymbol: Record<string, SymbolPerformance> = {};
    for (const t of closed) {
      if (!bySymbol[t.symbol]) {
        bySymbol[t.symbol] = { trades: 0, wins: 0, losses: 0, totalPnlUsd: 0 };
      }
      const s = bySymbol[t.symbol];
      s.trades += 1;
      if (t.outcome === "win") s.wins += 1;
      if (t.outcome === "loss") s.losses += 1;
      s.totalPnlUsd += t.pnlUsd ?? 0;
    }

    state.performance[strategy] = {
      strategy,
      trades: closed.length,
      wins,
      losses,
      totalPnlUsd,
      winRate: closed.length ? wins / closed.length : 0,
      weight,
      paused,
      bySymbol,
    };
  }
  return state;
}
