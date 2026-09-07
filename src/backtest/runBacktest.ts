import { MemoryState, StrategyId, StrategyInput, TradeRecord } from "../types";
import { generateOpportunities } from "../strategies";
import { evaluateAll } from "../risk/riskManager";
import { buildScenarios, loadHistoricalData } from "./buildScenarios";
import { recomputePerformanceState } from "../memory/store";

import { PATHS } from "../config/paths";
import { writeJsonAtomic } from "../config/persistence";

const BACKTEST_MEMORY_PATH = PATHS.BACKTEST_MEMORY;

interface BacktestResult {
  scenarios: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  cumulativePnlUsd: number;
  maxDrawdownPct: number;
  perStrategy: Record<string, { trades: number; wins: number; pnl: number }>;
}

function emptyBacktestMemory(): MemoryState {
  const ALL_STRATEGIES: StrategyId[] = [
    "funding_rate",
    "funding_rate_neutral",
    "momentum",
    "onchain_alpha",
    "convert_yield",
    "prediction_market",
    "portfolio_rebalance",
    "sentiment",
  ];
  const performance = {} as MemoryState["performance"];
  for (const s of ALL_STRATEGIES) {
    performance[s] = {
      strategy: s,
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
  return {
    trades: [],
    performance,
    lastUpdated: new Date().toISOString(),
    equityCurve: [],
    onchainCooldowns: {},
  };
}

export function runBacktest(scenarios: StrategyInput[], verbose = false): BacktestResult {
  const memory = emptyBacktestMemory();
  const tradeLog: TradeRecord[] = [];
  let equity = scenarios[0]?.portfolio.totalEquityUsd ?? 10_000;
  let highWater = equity;
  let maxDrawdown = 0;

  const perStrategy: Record<string, { trades: number; wins: number; pnl: number }> = {};

  for (let i = 0; i < scenarios.length - 1; i++) {
    highWater = Math.max(highWater, equity);
    const currentDrawdown = highWater > 0 ? (highWater - equity) / highWater : 0;
    const scenario = {
      ...scenarios[i],
      portfolio: {
        ...scenarios[i].portfolio,
        totalEquityUsd: equity,
        highWaterMarkUsd: highWater,
        currentDrawdownPct: currentDrawdown,
      },
    };
    const nextScenario = scenarios[i + 1];

    const opportunities = generateOpportunities(scenario, memory);
    const sized = evaluateAll(opportunities, scenario.goals, scenario.portfolio, scenario.markets);
    const approved = sized.filter((s) => s.approved && s.finalSizeUsd > 0);

    for (const opp of approved) {
      // Simulate the primary leg and any paired hedge leg together. If a
      // required market is missing, do not invent a fill or PnL result.
      const legs = [
        {
          symbol: opp.symbol,
          direction: opp.direction,
          sizeUsd: opp.finalSizeUsd,
        },
        ...(opp.pairedLeg ? [opp.pairedLeg] : []),
      ];
      let pnlUsd = 0;
      let missingMarket = false;
      for (const leg of legs) {
        const currentMarket = scenario.markets.find((m) => m.symbol === leg.symbol);
        const nextMarket = nextScenario.markets.find((m) => m.symbol === leg.symbol);
        if (!currentMarket || !nextMarket || leg.direction === "hold") {
          missingMarket = true;
          break;
        }
        const pricePct = (nextMarket.priceUsd - currentMarket.priceUsd) / currentMarket.priceUsd;
        const dirSign = leg.direction === "long" || leg.direction === "buy" ? 1 : -1;
        pnlUsd += leg.sizeUsd * pricePct * dirSign;
      }
      if (missingMarket) continue;

      equity += pnlUsd;
      highWater = Math.max(highWater, equity);
      const drawdown = (highWater - equity) / highWater;
      maxDrawdown = Math.max(maxDrawdown, drawdown);

      const outcome: TradeRecord["outcome"] = pnlUsd > 0 ? "win" : pnlUsd < 0 ? "loss" : "breakeven";
      const trade: TradeRecord = {
        id: `bt-${opp.strategy}-${opp.symbol}-${i}`,
        timestamp: scenario.portfolio.timestamp,
        strategy: opp.strategy,
        symbol: opp.symbol,
        direction: opp.direction,
        venue: opp.venue,
        sizeUsd: opp.finalSizeUsd,
        confidence: opp.confidence,
        outcome,
        pnlUsd,
      };
      tradeLog.push(trade);
      memory.trades.push(trade);
      recomputePerformanceState(memory);

      if (!perStrategy[opp.strategy]) {
        perStrategy[opp.strategy] = { trades: 0, wins: 0, pnl: 0 };
      }
      perStrategy[opp.strategy].trades += 1;
      if (outcome === "win") perStrategy[opp.strategy].wins += 1;
      perStrategy[opp.strategy].pnl += pnlUsd;

      if (verbose) {
        console.log(
          `  Step ${i}: ${opp.strategy} ${opp.symbol} ${opp.direction} ` +
            `$${opp.finalSizeUsd.toFixed(0)} → PnL $${pnlUsd.toFixed(2)}`,
        );
      }
    }
  }

  // Persist backtest memory separately
  memory.trades = tradeLog;
  recomputePerformanceState(memory);
  writeJsonAtomic(BACKTEST_MEMORY_PATH, memory);

  const wins = tradeLog.filter((t) => t.outcome === "win").length;
  const losses = tradeLog.filter((t) => t.outcome === "loss").length;

  return {
    scenarios: scenarios.length,
    totalTrades: tradeLog.length,
    wins,
    losses,
    winRate: tradeLog.length ? wins / tradeLog.length : 0,
    cumulativePnlUsd: equity - (scenarios[0]?.portfolio.totalEquityUsd ?? 10_000),
    maxDrawdownPct: maxDrawdown,
    perStrategy,
  };
}

export function runBacktestFromFile(dataFilePath: string, verbose = false): void {
  console.log(`Loading historical data from ${dataFilePath}…`);
  const historicalData = loadHistoricalData(dataFilePath);

  const defaultGoals = {
    profile: "backtest",
    maxDrawdownPct: 0.2,
    maxPositionPct: 0.15,
    maxOnchainExposurePct: 0.05,
    maxLeverage: 2,
    minConfidence: 0.3,
    reviewIntervalHours: 4,
  };

  const scenarios = buildScenarios(historicalData, defaultGoals, 10_000);
  console.log(`Built ${scenarios.length} scenarios. Running backtest…`);

  const result = runBacktest(scenarios, verbose);

  console.log("\n======================================================================");
  console.log("BACKTEST REPORT");
  console.log("======================================================================");
  console.log(`Scenarios evaluated:  ${result.scenarios}`);
  console.log(`Total trades:         ${result.totalTrades}`);
  console.log(`Wins / Losses:        ${result.wins} / ${result.losses}`);
  console.log(`Win rate:             ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`Cumulative PnL:       $${result.cumulativePnlUsd.toFixed(2)}`);
  console.log(`Max drawdown:         ${(result.maxDrawdownPct * 100).toFixed(2)}%`);
  console.log("\nPer-strategy breakdown:");
  for (const [strategy, s] of Object.entries(result.perStrategy)) {
    const wr = s.trades ? ((s.wins / s.trades) * 100).toFixed(1) : "n/a";
    console.log(`  ${strategy}: ${s.trades} trades, ${wr}% WR, PnL $${s.pnl.toFixed(2)}`);
  }
  console.log(`\nBacktest memory written to: ${BACKTEST_MEMORY_PATH}`);
  console.log("NOTE: live memory.json was NOT modified.");
  console.log("NOTE: This is a signal-quality test, not a fill simulation or performance claim.");
  console.log("  The bundled fixture is a deterministic smoke test; use independent historical data for evaluation.");
  console.log("  Fees, slippage, and funding costs are not modeled.");
}
