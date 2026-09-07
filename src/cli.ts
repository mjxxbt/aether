#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { ALL_STRATEGIES, MemoryStore } from "./memory/store";
import { generateOpportunities } from "./strategies";
import { evaluateAll } from "./risk/riskManager";
import {
  createPendingAction,
  expireActions,
  expirePendingActionsForContext,
  expirePendingActionsForMode,
  listAllActions,
  listPendingActions,
  rejectAllPendingActions,
  resolveAction,
} from "./execution/confirmationGate";
import { buildExecutionInstruction } from "./execution/executionRouter";
import {
  AccountContextStatus,
  ExecutionContext,
  PortfolioSnapshot,
  RiskGoals,
  StrategyId,
  StrategyInput,
  TradeRecord,
} from "./types";
import {
  RiskGoalsSchema,
  StrategyInputSchema,
  TradeRecordSchema,
  PortfolioSnapshotSchema,
  validateOrThrow,
} from "./schemas";
import { logEvent } from "./events";
import { runBacktestFromFile } from "./backtest/runBacktest";
import { saveLiveScenario } from "./ingestor/binance";
import { normalizePortfolio } from "./context";
import { withStateLock } from "./config/transaction";
import { readExecutionInstruction, assertActionContext } from "./execution/authorization";

function resolveExecutionContext(
  source: StrategyInput["portfolioSource"],
  mode?: StrategyInput["portfolioMode"],
  explicit?: ExecutionContext,
): ExecutionContext {
  const expected: ExecutionContext = source === "binance_mcp" ? "mcp_live" : "demo";
  if (source !== "binance_mcp" && mode === "live") {
    throw new Error(
      `Execution context mismatch: non-MCP source '${source ?? "scenario"}' cannot use live execution mode.`,
    );
  }
  if (explicit && explicit !== expected) {
    throw new Error(
      `Execution context mismatch: portfolioSource '${source ?? "scenario"}' requires ` +
        `'${expected}', received '${explicit}'.`,
    );
  }
  return expected;
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

const store = new MemoryStore();

const JSON_MODE = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonArg(flagName: string): unknown {
  const idx = process.argv.indexOf(flagName);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flagName}`);
  // Inline JSON can be longer than the OS path limit; never pass it blindly
  // to existsSync as a candidate pathname.
  const looksLikeInlineJson = value.startsWith("{") || value.startsWith("[");
  if (!looksLikeInlineJson && value.length < 4096) {
    const filePath = path.resolve(value);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch (err) {
      throw new Error(`Could not read JSON file for ${flagName}: ${(err as Error).message}`);
    }
  }
  return JSON.parse(value);
}

async function loadScenario(): Promise<StrategyInput> {
  const scenarioArg = readJsonArg("--scenario");
  const portfolioArg = readJsonArg("--portfolio");
  if (scenarioArg && portfolioArg) {
    throw new Error("Use either --scenario or --portfolio, not both.");
  }
  if (portfolioArg !== undefined) {
    if (process.argv.includes("--offline")) {
      throw new Error("--portfolio requires live market data; remove --offline.");
    }
    const portfolio = validateOrThrow(PortfolioSnapshotSchema, portfolioArg, "--portfolio") as PortfolioSnapshot;
    resolveExecutionContext("binance_mcp", portfolio.portfolioMode, portfolio.executionContext);
    if (!portfolio.availableBalancesUsd) {
      throw new Error(
        "--portfolio requires availableBalancesUsd for venue-aware risk sizing. " +
          "Include spotUsd, marginUsd, usdmFuturesUsd, and coinmFuturesUsd from read-only MCP wallet data.",
      );
    }
    if (!portfolio.spotAssetBalancesUsd) {
      throw new Error(
        "--portfolio requires spotAssetBalancesUsd for safe Spot SELL sizing. " +
          "Provide USD-equivalent base-asset holdings from the read-only Spot account response, or {} when none are held.",
      );
    }
    if (!JSON_MODE) {
      console.log("Using the validated Binance MCP portfolio snapshot from --portfolio.");
    }
    return await saveLiveScenario(portfolio, "binance_mcp");
  }
  if (!scenarioArg && process.argv.includes("--offline")) {
    const offlinePath = path.resolve("examples/demo-scenario.json");
    if (!fs.existsSync(offlinePath)) {
      throw new Error(`Offline demo scenario not found: ${offlinePath}`);
    }
    return {
      ...(validateOrThrow(
        StrategyInputSchema,
        JSON.parse(fs.readFileSync(offlinePath, "utf-8")),
        "offline demo scenario",
      ) as StrategyInput),
      portfolioSource: "offline",
      portfolioMode: "paper",
      executionContext: "demo",
      goals: store.load().goals ?? scenarioGoals(offlinePath),
    };
  }
  if (scenarioArg) {
    const partial = validateOrThrow(StrategyInputSchema, scenarioArg, "--scenario") as Partial<StrategyInput>;

    // If the agent provided portfolio/goals but omitted markets,
    // auto-fetch the Top 20 live market data and merge them in.
    if (!partial.markets || partial.markets.length === 0) {
      if (!JSON_MODE) console.log("No markets in --scenario. Auto-fetching Top 20 live Binance markets...");
      const source = partial.portfolioSource ?? "scenario";
      const executionContext = resolveExecutionContext(source, partial.portfolioMode, partial.executionContext);
      const live = await saveLiveScenario(partial.portfolio ?? undefined, source);
      return {
        ...live,
        goals: partial.goals ?? live.goals,
        portfolio: live.portfolio, // already handles $0 fallback in saveLiveScenario
        portfolioSource: partial.portfolioSource ?? live.portfolioSource,
        portfolioMode: live.portfolioMode,
        executionContext,
        onchainCandidates: partial.onchainCandidates ?? live.onchainCandidates,
        predictionMarkets: partial.predictionMarkets ?? live.predictionMarkets,
      };
    }

    // Full scenario — must have goals and portfolio
    if (!partial.goals || !partial.portfolio) {
      throw new Error("--scenario must include 'goals' and 'portfolio' when 'markets' is provided.");
    }
    const portfolioSource = partial.portfolioSource ?? "scenario";
    const executionContext = resolveExecutionContext(portfolioSource, partial.portfolioMode, partial.executionContext);
    return normalizePaperPortfolio({
      ...(partial as StrategyInput),
      portfolioSource,
      portfolioMode: partial.portfolioMode ?? (portfolioSource === "binance_mcp" ? "live" : "paper"),
      executionContext,
    });
  }
  if (!JSON_MODE) console.log("No --scenario provided. Fetching live Binance data...");
  return await saveLiveScenario();
}

function printHeader(title: string): void {
  if (JSON_MODE) return;
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

function out(human: string, data?: unknown): void {
  if (JSON_MODE) {
    if (data !== undefined) console.log(JSON.stringify(data));
  } else {
    console.log(human);
  }
}

function normalizePaperPortfolio(input: StrategyInput): StrategyInput {
  return { ...input, ...normalizePortfolio(input.portfolio, input.portfolioSource ?? "scenario", input.portfolioMode) };
}

function scenarioGoals(file: string): RiskGoals {
  return JSON.parse(fs.readFileSync(file, "utf8")).goals;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdSetGoals(): void {
  const rawGoals = readJsonArg("--goals");
  if (!rawGoals) throw new Error("Usage: aether set-goals --goals <file-or-json>");
  const goals = validateOrThrow(RiskGoalsSchema, rawGoals, "--goals") as RiskGoals;
  store.setGoals(goals);
  if (goals.maxPositionPct === 0) {
    expireActions(() => true);
    const memory = store.load();
    memory.riskHalt = { reason: "EMERGENCY_STOP: Risk profile is halted.", timestamp: new Date().toISOString() };
    store.save(memory);
  }
  out("Goals saved to memory.", { ok: true, goals });
}

async function cmdScore(): Promise<void> {
  const input = await loadScenario();
  const memory = store.load();
  // Scoring is observational: it must not revoke approvals or switch accounts.
  const opportunities = generateOpportunities(input, memory);

  for (const o of opportunities) {
    logEvent("opportunity_generated", {
      strategy: o.strategy,
      symbol: o.symbol,
      direction: o.direction,
      confidence: o.confidence,
    });
  }

  printHeader("OPPORTUNITIES (post strategy-performance weighting)");
  if (opportunities.length === 0) {
    out("No opportunities cleared the confidence floor.", { opportunities: [] });
    return;
  }

  if (JSON_MODE) {
    out("", { opportunities });
  } else {
    for (const o of opportunities) {
      console.log(
        `\n[${o.strategy}] ${o.symbol} — ${o.direction} on ${o.venue} ` +
          `(confidence ${(o.confidence * 100).toFixed(1)}%, suggested $${o.suggestedSizeUsd})`,
      );
      console.log(`  ${o.rationale}`);
      if (o.pairedLeg) {
        console.log(
          `  PAIRED: ${o.pairedLeg.direction} $${o.pairedLeg.sizeUsd} ${o.pairedLeg.symbol} ` +
            `on ${o.pairedLeg.venue}`,
        );
      }
    }
  }
}

async function cmdPropose(): Promise<void> {
  const input = await loadScenario();
  return withStateLock(() => proposeInput(input));
}

function proposeInput(input: StrategyInput): void {
  const memory = store.load();
  input = { ...input, goals: memory.goals ?? input.goals };
  const executionContext =
    input.executionContext ?? resolveExecutionContext(input.portfolioSource, input.portfolioMode);
  const executionMode = input.portfolioMode ?? "paper";
  if (
    memory.accountContext?.executionContext === "mcp_live" &&
    executionContext === "demo" &&
    !process.argv.includes("--allow-context-switch")
  ) {
    throw new Error(
      "MCP_CONTEXT_SWITCH_REQUIRED: Use --allow-context-switch only after approving the switch to DEMO / PAPER.",
    );
  }
  expirePendingActionsForContext(executionContext);
  expirePendingActionsForMode(executionMode);
  // A fresh account snapshot supersedes every previously confirmed instruction.
  expireActions((action) => action.status === "confirmed");
  const opportunities = generateOpportunities(input, memory);
  const sized = evaluateAll(opportunities, input.goals, input.portfolio, input.markets);

  // Append equity curve snapshot (Phase 1.6)
  store.appendEquityCurve(input.portfolio, input.portfolioSource);

  const accountContext: AccountContextStatus = {
    source: input.portfolioSource ?? "scenario",
    mode: input.portfolioMode ?? "paper",
    executionContext,
    capturedAt: input.portfolio.timestamp,
    totalEquityUsd: input.portfolio.totalEquityUsd,
    highWaterMarkUsd: input.portfolio.highWaterMarkUsd,
    currentDrawdownPct: input.portfolio.currentDrawdownPct,
    openPositions: input.portfolio.positions.length,
    availableBalancesUsd: input.portfolio.availableBalancesUsd,
    spotAssetBalancesUsd: input.portfolio.spotAssetBalancesUsd,
  };
  store.recordAccountContext(accountContext);

  // Persist the latest hard-stop state so the dashboard and orchestrating
  // agent can surface a real halt instead of inferring it from pending trades.
  const emergency = sized.find((opportunity) => opportunity.rejectionReason?.startsWith("EMERGENCY_STOP:"));
  const stateAfterRisk = store.load();
  const haltReason =
    input.portfolio.currentDrawdownPct >= input.goals.maxDrawdownPct
      ? "EMERGENCY_STOP: Drawdown limit reached. New risk is blocked."
      : input.goals.maxPositionPct === 0
        ? "EMERGENCY_STOP: Risk profile is halted."
        : input.markets.some((m) => (m.symbol === "BTCUSDT" || m.symbol === "ETHUSDT") && (m.change24hPct ?? 0) < -0.1)
          ? "EMERGENCY_STOP: Flash crash detected. New risk is blocked."
          : emergency?.rejectionReason;
  if (haltReason) {
    stateAfterRisk.riskHalt = {
      reason: haltReason,
      timestamp: new Date().toISOString(),
    };
  } else {
    delete stateAfterRisk.riskHalt;
  }
  store.save(stateAfterRisk);

  for (const s of sized) {
    logEvent("opportunity_sized", {
      strategy: s.strategy,
      symbol: s.symbol,
      approved: s.approved,
      finalSizeUsd: s.finalSizeUsd,
      rejectionReason: s.rejectionReason,
    });
  }

  printHeader("RISK-SIZED OPPORTUNITIES");
  if (!JSON_MODE) {
    for (const s of sized) {
      console.log(`\n${s.symbol} [${s.strategy}] approved=${s.approved} finalSize=$${s.finalSizeUsd}`);
      if (s.riskNotes.length) console.log(`  notes: ${s.riskNotes.join(" ")}`);
      if (s.rejectionReason) console.log(`  rejected: ${s.rejectionReason}`);
    }
  }

  const approved = sized.filter((s) => s.approved && s.finalSizeUsd > 0);
  if (approved.length === 0) {
    expireActions(() => true);
    out("\nNo opportunities were approved by the risk manager.", {
      sized,
      pendingActions: [],
      accountContext,
    });
    return;
  }

  printHeader("PENDING CONFIRMATIONS (no execution has happened)");
  const pendingActions = [];
  for (const opp of approved) {
    const actionExecutionMode = opp.signalContext === "demo" ? "paper" : executionMode;
    const action = createPendingAction(opp, undefined, actionExecutionMode, executionContext);
    pendingActions.push(action);
    logEvent("action_proposed", {
      actionId: action.id,
      strategy: opp.strategy,
      symbol: opp.symbol,
      finalSizeUsd: opp.finalSizeUsd,
      executionMode: actionExecutionMode,
      signalContext: opp.signalContext ?? "agent_os",
    });
    if (!JSON_MODE) {
      console.log(`\n--- Pending action ${action.id} ---`);
      console.log(action.summary);
    }
  }
  const currentIds = new Set(pendingActions.map((action) => action.id));
  expireActions((action) => !currentIds.has(action.id));
  out(`\nReview live actions in the dashboard. Paper actions may only be inspected or rejected.`, {
    sized,
    pendingActions,
    accountContext,
  });
}

function cmdConfirm(reject = false): void {
  const idIdx = process.argv.indexOf("--id");
  const id = idIdx >= 0 ? process.argv[idIdx + 1] : undefined;
  if (!id || id.startsWith("--")) throw new Error(`Usage: aether ${reject ? "reject" : "confirm"} --id <action-id>`);
  if (!reject) {
    const accountContext = store.load().accountContext;
    if (accountContext) {
      expirePendingActionsForContext(accountContext.executionContext);
      expirePendingActionsForMode(accountContext.mode);
    }
  }
  // Build the instruction before changing the durable status. If an action
  // is malformed, it remains pending and can be inspected or rejected rather
  // than becoming permanently confirmed without a usable instruction.
  const existing = listAllActions().find((candidate) => candidate.id === id);
  if (!existing) throw new Error(`No pending action found with id ${id}`);
  if (existing.status !== "pending") {
    throw new Error(`Action ${id} was already resolved as '${existing.status}'.`);
  }
  if (!reject) assertActionContext(existing, store.load());
  const instruction = !reject ? buildExecutionInstruction({ ...existing, status: "confirmed" }) : undefined;
  const action = resolveAction(id, reject ? "rejected" : "confirmed");
  logEvent(reject ? "action_rejected" : "action_confirmed", { actionId: id });

  // On-chain cooldown: if a rejected action was an onchain_alpha, record it
  if (reject && action.opportunity.strategy === "onchain_alpha") {
    const address = action.opportunity.raw?.["address"] as string | undefined;
    if (address) store.recordOnchainCooldown(address);
  }

  out(`Action ${id} marked as ${action.status}.`, { action });

  if (!reject && instruction) {
    printHeader("EXECUTION INSTRUCTION (for the orchestrating agent to carry out)");
    out(JSON.stringify(instruction, null, 2), { instruction });
    if (!JSON_MODE) {
      console.log(
        `\nThe orchestrating agent should now resolve the '${instruction.toolHint}' ` +
          `hint against its currently exposed tools and call the matching tool ` +
          `via ${instruction.route === "binance_mcp" ? "the Binance MCP Server" : "the Agentic Wallet skill"}.`,
      );
      if (instruction.pairedLegInstruction) {
        console.log(
          `\nAfter the primary entry returns FILLED, verify its actual filled quantity. ` +
            `Then resolve the paired-leg hint '${instruction.pairedLegInstruction.toolHint}' ` +
            `and size it from that actual fill. If either leg fails, stop and alert the user; ` +
            `the exchange does not provide atomicity here.`,
        );
      }
    }
  }
}

function cmdListPending(): void {
  const pending = listPendingActions();
  printHeader(`PENDING ACTIONS (${pending.length})`);
  out("", { pending });
  if (!JSON_MODE) {
    for (const a of pending) {
      console.log(`\n${a.id}`);
      console.log(a.summary);
    }
  }
}

function cmdRejectAll(): void {
  const rejected = rejectAllPendingActions();
  for (const action of rejected) {
    if (action.opportunity.strategy === "onchain_alpha") {
      const address = action.opportunity.raw?.["address"] as string | undefined;
      if (address) store.recordOnchainCooldown(address);
    }
    logEvent("action_rejected", { actionId: action.id, bulk: true });
  }
  out(`Rejected ${rejected.length} pending action(s).`, {
    ok: true,
    rejectedCount: rejected.length,
    actions: rejected.map((action) => action.id),
  });
}

function cmdRecordTrade(): void {
  const rawTrade = readJsonArg("--trade");
  if (!rawTrade) throw new Error("Usage: aether record-trade --trade <file-or-json>");
  const trade = validateOrThrow(TradeRecordSchema, rawTrade, "--trade") as TradeRecord;
  if (!trade.id) trade.id = `${trade.strategy}-${trade.symbol}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  if (!trade.timestamp) trade.timestamp = new Date().toISOString();
  store.recordTrade(trade);
  store.recomputePerformance();
  logEvent("trade_recorded", {
    id: trade.id,
    strategy: trade.strategy,
    symbol: trade.symbol,
    outcome: trade.outcome,
    pnlUsd: trade.pnlUsd,
  });
  out("Trade recorded and strategy performance recomputed.", { ok: true, trade });
}

function cmdReport(): void {
  const memory = store.load();
  printHeader("STRATEGY PERFORMANCE REPORT");

  if (JSON_MODE) {
    out("", { performance: memory.performance, equityCurve: memory.equityCurve, trades: memory.trades });
    return;
  }

  for (const strategy of Object.keys(memory.performance) as StrategyId[]) {
    const p = memory.performance[strategy];
    console.log(
      `\n${strategy}: trades=${p.trades} wins=${p.wins} losses=${p.losses} ` +
        `winRate=${(p.winRate * 100).toFixed(1)}% totalPnl=$${p.totalPnlUsd.toFixed(2)} ` +
        `weight=${p.weight.toFixed(2)} paused=${p.paused}`,
    );
    // Phase 1.6: per-symbol breakdown
    if (p.bySymbol && Object.keys(p.bySymbol).length > 0) {
      for (const [sym, s] of Object.entries(p.bySymbol)) {
        console.log(`    ${sym}: ${s.trades} trades, ${s.wins}W/${s.losses}L, ` + `PnL $${s.totalPnlUsd.toFixed(2)}`);
      }
    }
  }

  printHeader("AUDIT LOG (all pending/confirmed/rejected actions)");
  const all = listAllActions();
  if (all.length === 0) console.log("No actions logged yet.");
  for (const a of all) {
    console.log(`\n${a.id} [${a.status}] created ${a.createdAt}`);
  }

  if (memory.equityCurve && memory.equityCurve.length > 0) {
    printHeader("EQUITY CURVE (last 5 points)");
    for (const pt of memory.equityCurve.slice(-5)) {
      console.log(
        `  ${pt.timestamp}: $${pt.totalEquityUsd.toFixed(2)} ` + `(drawdown ${(pt.drawdownPct * 100).toFixed(2)}%)`,
      );
    }
  }
}

function cmdResetStrategy(): void {
  const idx = process.argv.indexOf("--strategy");
  const rawStrategy = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!rawStrategy || rawStrategy.startsWith("--")) throw new Error("Usage: aether reset-strategy --strategy <id>");
  if (!ALL_STRATEGIES.includes(rawStrategy as StrategyId)) {
    throw new Error(`Unknown strategy '${rawStrategy}'. Valid strategies: ${ALL_STRATEGIES.join(", ")}`);
  }
  const strategy = rawStrategy as StrategyId;
  store.resetStrategy(strategy);
  out(`Strategy '${strategy}' performance reset.`, { ok: true, strategy });
}

function cmdBacktest(): void {
  const dataArg = process.argv.indexOf("--data");
  const dataPath = dataArg >= 0 ? process.argv[dataArg + 1] : undefined;
  if (!dataPath || dataPath.startsWith("--")) {
    throw new Error("Usage: aether backtest --data <historical-klines.json>");
  }
  const verbose = process.argv.includes("--verbose");
  runBacktestFromFile(dataPath, verbose);
}

async function cmdDemo(): Promise<void> {
  if (!JSON_MODE) {
    console.log(
      `Running the full Aether pipeline against ${process.argv.includes("--offline") ? "the bundled offline scenario" : "public Binance market data (DEMO / PAPER)"}:\n` +
        "score -> propose -> (you confirm/reject) -> report\n",
    );
  }
  await cmdScore();
  await cmdPropose();
  if (!JSON_MODE) {
    printHeader("NEXT STEPS");
    console.log(
      "Copy a pending action id from above, then run e.g.:\n" +
        "  npm start -- reject --id <id>\n" +
        "Paper actions cannot be confirmed. For live actions, review and confirm in the dashboard.\n" +
        "Then check the audit trail with:\n" +
        "  npm start -- report\n\n" +
        "Start the local dashboard:\n" +
        "  npm run dashboard",
    );
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cmd = process.argv[2];
  try {
    switch (cmd) {
      case "set-goals":
        return withStateLock(cmdSetGoals);
      case "score":
        return await cmdScore();
      case "propose":
        return await cmdPropose();
      case "confirm":
        return withStateLock(() => cmdConfirm(false));
      case "reject":
        return withStateLock(() => cmdConfirm(true));
      case "instruction":
        return withStateLock(() => {
          const index = process.argv.indexOf("--id");
          const id = index < 0 ? undefined : process.argv[index + 1];
          if (!id || id.startsWith("--")) throw new Error("Usage: aether instruction --id <confirmed-action-id>");
          const instruction = readExecutionInstruction(id);
          out(JSON.stringify(instruction, null, 2), { instruction });
        });
      case "pending":
        return withStateLock(cmdListPending);
      case "state":
        return withStateLock(() => {
          const memory = store.load();
          if (memory.accountContext) {
            expirePendingActionsForContext(memory.accountContext.executionContext);
            expirePendingActionsForMode(memory.accountContext.mode);
          }
          out("", { memory, pendingActions: listAllActions() });
        });
      case "reject-all":
        return withStateLock(cmdRejectAll);
      case "record-trade":
        return withStateLock(cmdRecordTrade);
      case "report":
        return withStateLock(cmdReport);
      case "reset-strategy":
        return withStateLock(cmdResetStrategy);
      case "backtest":
        return cmdBacktest();
      case "demo":
        return await cmdDemo();
      default:
        console.log(
          [
            "Aether engine CLI",
            "",
            "Commands:",
            "  set-goals --goals <file|json>       Save risk goals to memory",
            "  score --scenario <file|json>        Run strategy modules, print weighted opportunities",
            "  propose --scenario <file|json>      Score + risk-size + create demo or MCP-context confirmations",
            "  propose --portfolio <file|json>     Use a validated Binance MCP account snapshot",
            "  confirm --id <id>                   Confirm only a real Agent OS action, print its instruction",
            "  instruction --id <id>               Recheck and retrieve an existing confirmed instruction",
            "  reject --id <id>                    Reject a pending action",
            "  pending                             List all currently pending actions",
            "  reject-all                          Reject all pending actions (explicit cleanup)",
            "  record-trade --trade <file|json>    Log a closed trade outcome and update strategy weights",
            "  report                              Print strategy performance + full audit log",
            "  reset-strategy --strategy <id>      Reset a paused/underperforming strategy's memory",
            "  backtest --data <klines.json>       Run the backtest harness on historical data",
            "  demo                                Run a public-market paper demo, or bundled demo with --offline",
            "",
            "Flags:",
            "  --json                              Output machine-readable JSON instead of formatted text",
            "  --offline                           Use the bundled scenario for demo/score/propose",
            "  --verbose                           (backtest only) print every simulated trade",
          ].join("\n"),
        );
    }
  } catch (err) {
    if (JSON_MODE) {
      console.error(JSON.stringify({ error: (err as Error).message }));
    } else {
      console.error(`Error: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();
