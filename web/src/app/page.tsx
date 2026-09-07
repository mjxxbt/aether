"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Toaster, toast } from "react-hot-toast";
import {
  Activity,
  ArrowUpRight,
  CheckCircle,
  CircleDot,
  Clock3,
  Cpu,
  Database,
  LockKeyhole,
  Radar,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";

import type {
  AccountContextStatus,
  StrategyPerformance,
  PendingAction,
  TradeRecord,
  MemoryState,
} from "../../../src/types";
import { RISK_PROFILE_LIST, type RiskProfileId } from "../../../src/risk/profiles";

type EngineState = {
  memory?: MemoryState;
  pendingActions?: PendingAction[];
};

type CommandGroup = {
  title: string;
  description: string;
  type: "CODEX" | "CLI";
  commands: Array<{ label: string; description: string; value: string }>;
};

function buildAgentContinuationCommand(actionId: string): string {
  return [
    `I confirmed Aether Action ID ${actionId} in the dashboard.`,
    "The dashboard has already recorded the confirmation; do not run aether confirm again.",
    `Read AGENTS.md and docs/AGENT_OS_INTEGRATION.md. Retrieve the current instruction with aether instruction --id ${actionId}.`,
    "Re-check this exact confirmed action, perform every required read-only preflight, resolve the currently exposed Binance MCP or Agent OS tool schema, show me the final order parameters and protection plan, and wait for my explicit YES before any write.",
    "Execute only this Action ID and stop if any parameter, account context, filter, balance, or protection detail differs.",
  ].join(" ");
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Codex quick controls",
    description: "Short requests understood through the repository's AGENTS.md contract.",
    type: "CODEX",
    commands: [
      {
        label: "Initialize this session",
        description: "Load the short Codex contract and full Aether safety policy.",
        value: "Read AGENTS.md and use it as the operating contract for this Aether session.",
      },
      {
        label: "Local checks",
        description: "Build the engine and run the complete automated test suite.",
        value: "Run Aether local checks.",
      },
      {
        label: "MCP account-aware scan",
        description:
          "Fetch read-only Binance MCP account data, pass only a sanitized snapshot to Aether, and stop at pending actions.",
        value: "Run an MCP account-aware read-only Aether scan.",
      },
      {
        label: "Safe balance summary",
        description: "Show aggregate MCP equity and funding status without raw account rows or identifiers.",
        value: "Show my Binance MCP balance safely.",
      },
      {
        label: "Paper demo",
        description: "Run the deterministic offline fixture without any Binance writes.",
        value: "Run the paper demo.",
      },
      {
        label: "Open dashboard",
        description: "Start the local dashboard and provide its localhost URL.",
        value: "Open the Aether dashboard.",
      },
      {
        label: "Execute confirmed action",
        description:
          "Paste after confirming one exact MCP LIVE action; the dashboard has already recorded confirmation and the agent must preflight before any write.",
        value: buildAgentContinuationCommand("<exact-id>"),
      },
      {
        label: "Reject everything pending",
        description: "Explicitly reject all unresolved actions and preserve the audit trail.",
        value: "Reject all pending actions.",
      },
      {
        label: "Apply a risk profile",
        description: "Change future scan limits without changing existing approvals.",
        value: "Apply the Growth risk profile, save it, and report the active limits. Do not scan or trade yet.",
      },
      {
        label: "On-chain research",
        description: "Use read-only Skills Hub tools to find and audit BNB Chain candidates.",
        value:
          "Use only read-only Binance Skills to find audited trending BNB Chain candidates, then prepare Aether input. Do not swap.",
      },
      {
        label: "Prediction-market research",
        description: "Read available prediction markets and prepare validated Aether input.",
        value:
          "Use only read-only Binance Wallet/Skills tools to query prediction markets, then prepare Aether input. Do not place an order.",
      },
      {
        label: "Portfolio rebalance",
        description: "Evaluate drift against a target allocation without trading.",
        value:
          "Set my target allocation to 60% BTC and 40% ETH. Calculate drift and propose a rebalance, but do not execute.",
      },
      {
        label: "Performance report",
        description: "Review strategy weights, outcomes, and equity history.",
        value: "Run the Aether performance report and explain which strategies are active, paused, or underperforming.",
      },
      {
        label: "Emergency halt",
        description: "Stop new proposals and reject unresolved actions before investigation.",
        value:
          "Emergency stop: reject all pending actions, stop all Binance writes, and set Aether to a halted risk profile. Do not trade.",
      },
    ],
  },
  {
    title: "CLI: install and verify",
    description: "Run from the Aether repository root.",
    type: "CLI",
    commands: [
      { label: "Install engine", description: "Install root dependencies.", value: "npm install" },
      { label: "Install dashboard", description: "Install dashboard dependencies.", value: "cd web && npm install" },
      { label: "Build engine", description: "Compile TypeScript into dist/.", value: "npm run build" },
      { label: "Run tests", description: "Run all backend tests in one process.", value: "npm test -- --runInBand" },
      {
        label: "Start dashboard",
        description: "Launch the local dashboard at http://localhost:3000.",
        value: "npm run dashboard",
      },
    ],
  },
  {
    title: "CLI: scan and proposal workflows",
    description: "Generate signals and risk-sized pending actions; these commands never place orders.",
    type: "CLI",
    commands: [
      {
        label: "Offline demo",
        description: "Reproducible fixture with no network or credentials.",
        value: "npm start -- demo --offline",
      },
      {
        label: "Public paper demo",
        description: "Run public Binance market data as DEMO / PAPER; it does not use MCP account data.",
        value: "npm start -- demo",
      },
      {
        label: "Offline scoring",
        description: "Score fixture opportunities without creating approvals.",
        value: "npm start -- score --offline",
      },
      {
        label: "MCP portfolio scan",
        description: "Use the sanitized account file produced by Codex; shows MCP LIVE or MCP DATA / PAPER.",
        value: "npm start -- propose --portfolio /tmp/aether-mcp-portfolio.json",
      },
      {
        label: "Public market scan",
        description:
          "Use public Binance market data as DEMO / PAPER; no account data or live execution. Switching from MCP requires confirmation.",
        value: "npm start -- propose --json",
      },
      {
        label: "View pending actions",
        description: "List every unresolved Action ID as JSON.",
        value: "npm start -- pending --json",
      },
    ],
  },
  {
    title: "CLI: decisions, memory, and research",
    description: "Review, resolve, and maintain Aether state.",
    type: "CLI",
    commands: [
      {
        label: "Confirm one real Agent OS action",
        description:
          "Generate an execution instruction only for an MCP LIVE or LIVE AGENT OS WALLET / SKILLS action after dashboard confirmation.",
        value: "npm start -- instruction --id '<exact-action-id>' --json",
      },
      {
        label: "Reject one action",
        description: "Reject a specific pending action.",
        value: "npm start -- reject --id '<exact-action-id>' --json",
      },
      {
        label: "Reject all",
        description: "Reject every pending action with explicit bulk cleanup.",
        value: "npm start -- reject-all --json",
      },
      {
        label: "Set risk goals",
        description: "Save explicit risk limits for future scans.",
        value:
          'npm start -- set-goals --goals \'{"profile":"balanced","maxDrawdownPct":0.08,"maxPositionPct":0.15,"maxOnchainExposurePct":0.05,"maxLeverage":2,"minConfidence":0.4,"reviewIntervalHours":4}\'',
      },
      {
        label: "Record outcome",
        description: "Log only the verified external result of a completed trade.",
        value:
          'npm start -- record-trade --trade \'{"strategy":"momentum","symbol":"BTCUSDT","direction":"buy","venue":"spot","sizeUsd":100,"confidence":0.6,"outcome":"win","pnlUsd":4.25}\'',
      },
      {
        label: "Performance report",
        description: "Show strategy weights, outcomes, trades, and equity curve.",
        value: "npm start -- report",
      },
      {
        label: "Reset strategy",
        description: "Clear one strategy's history and restore its weight.",
        value: "npm start -- reset-strategy --strategy momentum",
      },
      {
        label: "Backtest",
        description: "Run the bundled historical-kline smoke test.",
        value: "npm start -- backtest --data examples/backtest-klines.json",
      },
      {
        label: "Focused safety tests",
        description: "Run confirmation, transfer, and x402 instruction tests.",
        value:
          "npm test -- --runInBand tests/execution/transferRouting.test.ts tests/execution/confirmationGate.test.ts",
      },
    ],
  },
];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`State request failed (${response.status})`);
  return response.json();
};

export default function Dashboard() {
  const [scanning, setScanning] = useState(false);
  const [selectedAction, setSelectedAction] = useState<PendingAction | null>(null);
  const [executionInstruction, setExecutionInstruction] = useState<Record<string, unknown> | null>(null);
  const [confirmedActionId, setConfirmedActionId] = useState<string | null>(null);

  const [showLogTrade, setShowLogTrade] = useState(false);
  const [showCommandCenter, setShowCommandCenter] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    strategy: "momentum",
    symbol: "",
    direction: "long",
    venue: "spot",
    sizeUsd: "",
    confidence: "0.5",
    outcome: "win",
    pnlUsd: "",
  });
  const [loggingTrade, setLoggingTrade] = useState(false);
  const tradeIdRef = useRef<string | null>(null);
  const [isGlobalHalt, setIsGlobalHalt] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RiskProfileId>("balanced");
  const [savingProfile, setSavingProfile] = useState(false);
  const [clearingPending, setClearingPending] = useState(false);

  // Keep track of pending actions to trigger toasts
  const notifiedActionsRef = useRef<Set<string>>(new Set());
  const hasSyncedPendingRef = useRef(false);
  const hasInitializedProfileRef = useRef(false);

  const {
    data: state,
    error,
    mutate,
  } = useSWR<EngineState>("/api/state", fetcher, {
    refreshInterval: 3000,
    onSuccess: (data) => {
      const storedProfile = data?.memory?.goals?.profile;
      if (!hasInitializedProfileRef.current && RISK_PROFILE_LIST.some((profile) => profile.id === storedProfile)) {
        hasInitializedProfileRef.current = true;
        setSelectedProfile(storedProfile as RiskProfileId);
      }
      // Check for global halt
      setIsGlobalHalt(Boolean(data?.memory?.riskHalt));
      // Notify on new pending actions
      if (data?.pendingActions) {
        const currentPendingIds = data.pendingActions.filter((a) => a.status === "pending").map((a) => a.id);

        // Establish the initial dashboard state silently. Existing actions
        // should not all appear as new notifications on page load.
        if (!hasSyncedPendingRef.current) {
          hasSyncedPendingRef.current = true;
          for (const id of currentPendingIds) notifiedActionsRef.current.add(id);
          return;
        }

        const newPendingIds = currentPendingIds.filter((id) => !notifiedActionsRef.current.has(id));
        for (const id of newPendingIds) notifiedActionsRef.current.add(id);
        if (newPendingIds.length > 0) {
          toast(
            newPendingIds.length === 1
              ? "New pending action proposed"
              : `${newPendingIds.length} new pending actions proposed`,
            {
              id: "pending-actions",
              icon: "🔔",
              style: { borderRadius: "10px", background: "#333", color: "#fff" },
            },
          );
        }
      }
    },
  });

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedAction(null);
        setExecutionInstruction(null);
        setShowLogTrade(false);
        setShowCommandCenter(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  const currentGoals = state?.memory?.goals;
  const currentProfile = RISK_PROFILE_LIST.find((profile) => profile.id === currentGoals?.profile);

  const handleApplyProfile = async () => {
    const definition = RISK_PROFILE_LIST.find((profile) => profile.id === selectedProfile);
    if (!definition) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: definition.goals }),
      });
      if (!res.ok) throw new Error("Failed to apply risk profile");
      toast.success(`${definition.label} profile applied`);
      await mutate();
    } catch {
      toast.error("Failed to apply risk profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleClearPending = async () => {
    if (!confirm("Reject all pending actions? This cannot be undone.")) return;
    setClearingPending(true);
    try {
      const res = await fetch("/api/clear-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error("Failed to clear pending actions");
      const result = await res.json();
      toast.success(`Rejected ${result.result?.rejectedCount ?? 0} pending action(s)`);
      await mutate();
    } catch {
      toast.error("Failed to clear pending actions.");
    } finally {
      setClearingPending(false);
    }
  };

  const copyActionId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Action ID copied");
    } catch {
      toast.error("Could not copy the action ID");
    }
  };

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Command copied");
    } catch {
      toast.error("Could not copy command");
    }
  };

  const handleAction = async (id: string, decision: "confirm" | "reject") => {
    if (actionInFlight) return;
    setActionInFlight(id);
    const actionDesc = decision === "confirm" ? "Confirmed" : "Rejected";
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: decision }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(`Error: ${data.error}`);
      } else {
        if (decision === "confirm") {
          const instruction = data.result?.instruction ?? data.result;
          if (instruction) {
            setConfirmedActionId(id);
            setExecutionInstruction(instruction);
          }
        }
        toast.success(`Action ${actionDesc}`);
      }
      mutate();
    } catch {
      toast.error("Failed to communicate with engine.");
    } finally {
      setActionInFlight(null);
    }
  };

  const handleScan = async () => {
    const activeContext = state?.memory?.accountContext?.executionContext;
    const switchingFromMcp = activeContext === "mcp_live";
    if (
      switchingFromMcp &&
      !window.confirm(
        "A real Binance MCP context is active. Public Market Scan will switch Aether to DEMO / PAPER, expire MCP approvals, and replace the dashboard context. Continue?",
      )
    ) {
      return;
    }
    setScanning(true);
    toast.loading(switchingFromMcp ? "Switching to DEMO / PAPER..." : "Scanning Public Markets...", { id: "scan" });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowContextSwitch: switchingFromMcp }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error ?? "Scan failed");
      }
      toast.success("Scan Complete", { id: "scan" });
      setTimeout(() => mutate(), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to scan markets.", { id: "scan" });
    } finally {
      setScanning(false);
    }
  };

  const handleLogTrade = async () => {
    const sizeUsd = Number(tradeForm.sizeUsd);
    const confidence = Number(tradeForm.confidence);
    const pnlUsd = tradeForm.pnlUsd === "" ? undefined : Number(tradeForm.pnlUsd);
    if (!tradeForm.symbol.trim() || !Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      toast.error("Symbol and Size are required.");
      return;
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      toast.error("Confidence must be between 0 and 1.");
      return;
    }
    if (pnlUsd !== undefined && !Number.isFinite(pnlUsd)) {
      toast.error("PnL must be a valid number.");
      return;
    }
    tradeIdRef.current ??= crypto.randomUUID();
    setLoggingTrade(true);
    try {
      const res = await fetch("/api/record-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: {
            ...tradeForm,
            id: tradeIdRef.current,
            sizeUsd,
            confidence,
            pnlUsd,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to log trade");
      toast.success("Trade logged successfully");
      tradeIdRef.current = null;
      setShowLogTrade(false);
      setTradeForm({
        strategy: "momentum",
        symbol: "",
        direction: "long",
        venue: "spot",
        sizeUsd: "",
        confidence: "0.5",
        outcome: "win",
        pnlUsd: "",
      });
      mutate();
    } catch {
      toast.error("Failed to log trade.");
    } finally {
      setLoggingTrade(false);
    }
  };

  const formatPct = (v: number) => (v * 100).toFixed(1) + "%";
  const formatUsd = (v: number) => (Number.isFinite(v) ? "$" + v.toFixed(2) : "—");

  const perf = Object.values(state?.memory?.performance || {});
  const pending = state?.pendingActions?.filter((a) => a.status === "pending") || [];
  const trades = useMemo(() => [...(state?.memory?.trades || [])].reverse().slice(0, 5), [state?.memory?.trades]);
  const recentActions = useMemo(
    () => [...(state?.pendingActions || [])].reverse().slice(0, 6),
    [state?.pendingActions],
  );
  const activeStrategies = perf.filter((entry) => !(entry as StrategyPerformance).paused).length;
  const confirmedCount = state?.pendingActions?.filter((action) => action.status === "confirmed").length ?? 0;
  const accountContext = state?.memory?.accountContext as AccountContextStatus | undefined;
  const isMcpLiveAction = (action: PendingAction) =>
    action.executionMode === "live" &&
    action.executionContext === "mcp_live" &&
    action.status === "pending" &&
    (!isGlobalHalt ||
      (action.opportunity.venue === "spot" &&
        action.opportunity.direction === "sell" &&
        !action.opportunity.pairedLeg));
  const actionDataContextLabel = (action: PendingAction) => {
    if (action.executionContext !== "mcp_live") return "DEMO / PUBLIC / SCENARIO";
    if (action.opportunity?.signalContext === "demo") return "MCP ACCOUNT / DEMO SIGNAL";
    if (
      action.opportunity?.raw?.type === "x402_payment" ||
      action.opportunity?.strategy === "prediction_market" ||
      action.opportunity?.venue === "onchain"
    ) {
      return "LIVE AGENT OS WALLET / SKILLS";
    }
    return "BINANCE MCP ACCOUNT";
  };
  const actionContextLabel = (action: PendingAction) => {
    if (action.executionContext !== "mcp_live") return "DEMO / PAPER";
    if (action.opportunity?.signalContext === "demo") return "DEMO SIGNAL / PAPER";
    const walletFlow = actionDataContextLabel(action) === "LIVE AGENT OS WALLET / SKILLS";
    if (action.executionMode === "live") return walletFlow ? "LIVE WALLET / SKILLS" : "MCP LIVE";
    return walletFlow ? "WALLET DATA / PAPER" : "MCP DATA / PAPER";
  };
  const allEquityCurve = state?.memory?.equityCurve || [];
  const scopedEquityCurve = accountContext
    ? (() => {
        const matching = allEquityCurve.filter(
          (point) => point.mode === accountContext.mode && point.source === accountContext.source,
        );
        return matching.length > 0 ? matching : allEquityCurve;
      })()
    : allEquityCurve;
  const equityCurve = scopedEquityCurve;
  const latestEquity = accountContext?.totalEquityUsd ?? equityCurve[equityCurve.length - 1]?.totalEquityUsd ?? 0;
  const highWaterMark =
    accountContext?.highWaterMarkUsd ?? Math.max(latestEquity, ...equityCurve.map((point) => point.totalEquityUsd));
  const liveDrawdown =
    accountContext?.currentDrawdownPct ??
    (highWaterMark > 0 ? Math.max(0, (highWaterMark - latestEquity) / highWaterMark) : 0);
  const spotAssetValueUsd = accountContext?.spotAssetBalancesUsd
    ? Object.values(accountContext.spotAssetBalancesUsd).reduce((sum, value) => sum + value, 0)
    : undefined;
  const accountSourceLabel =
    accountContext?.source === "binance_mcp"
      ? "BINANCE MCP"
      : accountContext?.source === "public_rest"
        ? "PUBLIC MARKET DATA"
        : accountContext?.source === "offline"
          ? "OFFLINE FIXTURE"
          : accountContext?.source === "scenario"
            ? "SCENARIO FILE"
            : "NO SNAPSHOT";
  const selectedOrderPreview = useMemo(() => {
    const opportunity = selectedAction?.opportunity;
    if (!opportunity?.referencePriceUsd || opportunity.stopPricePct === undefined) return null;
    const side = opportunity.direction === "long" || opportunity.direction === "buy" ? "BUY" : "SELL";
    const isSpotExit = opportunity.venue === "spot" && side === "SELL";
    if (isSpotExit) return { side, reference: opportunity.referencePriceUsd, isSpotExit };
    const takeProfitPct = opportunity.takeProfitPct ?? opportunity.stopPricePct * 2;
    return {
      side,
      reference: opportunity.referencePriceUsd,
      stop:
        side === "BUY"
          ? opportunity.referencePriceUsd * (1 - opportunity.stopPricePct)
          : opportunity.referencePriceUsd * (1 + opportunity.stopPricePct),
      takeProfit:
        side === "BUY"
          ? opportunity.referencePriceUsd * (1 + takeProfitPct)
          : opportunity.referencePriceUsd * (1 - takeProfitPct),
      stopPct: opportunity.stopPricePct,
      takeProfitPct,
      trailingStopPct: opportunity.trailingStopPct,
      isSpotExit,
    };
  }, [selectedAction]);

  return (
    <div className="dashboard-root">
      <Toaster position="bottom-right" />

      {/* Instrument-style background: quiet grid, amber focus light, no template gradients. */}
      <div className="terminal-backdrop" aria-hidden="true">
        <div className="terminal-glow" />
        <div className="terminal-grid" />
      </div>

      {/* LOG TRADE MODAL */}
      {showLogTrade && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Log Trade Outcome">
          <div className="modal-sheet bg-surface/95 border border-white/10 shadow-2xl backdrop-blur-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                <h2 className="text-base font-bold tracking-widest uppercase font-mono">Log Trade Outcome</h2>
                <button
                  onClick={() => setShowLogTrade(false)}
                  className="text-muted hover:text-white transition-colors text-xl leading-none p-1 rounded hover:bg-white/5"
                  aria-label="Close log trade modal"
                >
                  &times;
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Strategy</span>
                  <select
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    value={tradeForm.strategy}
                    onChange={(e) => setTradeForm({ ...tradeForm, strategy: e.target.value })}
                  >
                    {[
                      "funding_rate",
                      "funding_rate_neutral",
                      "momentum",
                      "onchain_alpha",
                      "convert_yield",
                      "prediction_market",
                      "portfolio_rebalance",
                      "sentiment",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Symbol (e.g. BTCUSDT)</span>
                  <input
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    placeholder="BTCUSDT"
                    value={tradeForm.symbol}
                    onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Direction</span>
                  <select
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    value={tradeForm.direction}
                    onChange={(e) => setTradeForm({ ...tradeForm, direction: e.target.value })}
                  >
                    <option value="long">long</option>
                    <option value="short">short</option>
                    <option value="buy">buy</option>
                    <option value="sell">sell</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Venue</span>
                  <select
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    value={tradeForm.venue}
                    onChange={(e) => setTradeForm({ ...tradeForm, venue: e.target.value })}
                  >
                    <option value="spot">spot</option>
                    <option value="usdm_futures">usdm_futures</option>
                    <option value="coinm_futures">coinm_futures</option>
                    <option value="margin">margin</option>
                    <option value="onchain">onchain</option>
                    <option value="transfer">transfer</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Size USD</span>
                  <input
                    type="number"
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    placeholder="1000"
                    value={tradeForm.sizeUsd}
                    onChange={(e) => setTradeForm({ ...tradeForm, sizeUsd: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Confidence (0–1)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    value={tradeForm.confidence}
                    onChange={(e) => setTradeForm({ ...tradeForm, confidence: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">Outcome</span>
                  <select
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    value={tradeForm.outcome}
                    onChange={(e) => setTradeForm({ ...tradeForm, outcome: e.target.value })}
                  >
                    <option value="win">win</option>
                    <option value="loss">loss</option>
                    <option value="breakeven">breakeven</option>
                    <option value="open">open</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider">PnL USD (optional)</span>
                  <input
                    type="number"
                    className="bg-background/60 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
                    placeholder="e.g. 120 or -45"
                    value={tradeForm.pnlUsd}
                    onChange={(e) => setTradeForm({ ...tradeForm, pnlUsd: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 justify-end">
                <button
                  onClick={() => setShowLogTrade(false)}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogTrade}
                  disabled={loggingTrade}
                  className="button-primary disabled:opacity-50"
                >
                  {loggingTrade ? "Saving..." : "Log Trade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND CENTER MODAL */}
      {showCommandCenter && (
        <div className="modal-backdrop modal-backdrop-top">
          <div
            className="command-center-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-center-title"
            style={{ maxWidth: "min(100%, 72rem)" }}
          >
            <div className="command-center-header">
              <div>
                <div className="eyebrow">
                  <Terminal size={13} /> Aether command center
                </div>
                <h2
                  id="command-center-title"
                  className="text-xl sm:text-2xl font-semibold tracking-tight text-white mt-2"
                >
                  Ordered operator controls
                </h2>
                <p className="text-xs text-muted mt-2 max-w-2xl leading-relaxed">
                  Copy a short Codex request or run the matching CLI command. MCP scans remain read-only until you
                  confirm an exact Action ID.
                </p>
              </div>
              <button
                onClick={() => setShowCommandCenter(false)}
                className="command-center-close"
                aria-label="Close command center"
              >
                &times;
              </button>
            </div>
            <div className="command-center-list">
              {COMMAND_GROUPS.map((group, groupIndex) => (
                <section key={group.title} className="command-group">
                  <div className="command-group-heading">
                    <div>
                      <div className="eyebrow">
                        <span className={`command-type command-type-${group.type.toLowerCase()}`}>{group.type}</span>{" "}
                        {String(groupIndex + 1).padStart(2, "0")} / {group.title}
                      </div>
                      <p>{group.description}</p>
                    </div>
                  </div>
                  <div className="command-entry-list">
                    {group.commands.map((command, commandIndex) => (
                      <article key={command.label} className="command-entry">
                        <div className="command-entry-index">{String(commandIndex + 1).padStart(2, "0")}</div>
                        <div className="command-entry-main">
                          <div className="command-entry-title">{command.label}</div>
                          <p className="command-entry-description">{command.description}</p>
                          <pre className="command-entry-value">{command.value}</pre>
                        </div>
                        <button
                          onClick={() => copyCommand(command.value)}
                          className="command-copy-button"
                          aria-label={`Copy ${command.label}`}
                        >
                          COPY
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="command-center-footer">
              <span>Engine writes instructions only. Codex performs external MCP actions after confirmation.</span>
              <button onClick={() => setShowCommandCenter(false)} className="button-secondary">
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXECUTION INSTRUCTION MODAL */}
      {executionInstruction && (
        <div className="modal-backdrop modal-backdrop-high">
          <div className="modal-sheet bg-surface/95 border border-accent/30 shadow-2xl font-mono overflow-hidden">
            <div className="overflow-y-auto flex-1 p-6">
            <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold tracking-widest uppercase text-accent">Execution Instruction</h2>
                <p className="text-xs text-muted mt-1 leading-relaxed max-w-sm">
                  Confirmation is recorded. Give the next command to your connected AI agent; it must still preflight
                  and request final authorization before any write.
                </p>
              </div>
              <button
                onClick={() => setExecutionInstruction(null)}
                className="text-muted hover:text-white transition-colors text-2xl leading-none p-1 ml-3 flex-shrink-0 rounded hover:bg-white/5"
                aria-label="Close execution instruction"
              >
                &times;
              </button>
            </div>
            {confirmedActionId && (
              <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-accent">Next Codex / agent command</div>
                  <button
                    onClick={() => copyCommand(buildAgentContinuationCommand(confirmedActionId))}
                    className="shrink-0 rounded-md border border-accent/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent hover:text-background transition-colors"
                  >
                    Copy command
                  </button>
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-muted">
                  Paste this into the same Codex or Agent OS session that has the Binance MCP connection.
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-gray-200">
                  {buildAgentContinuationCommand(confirmedActionId)}
                </pre>
              </div>
            )}
            <pre className="bg-black/50 text-gray-300 p-4 rounded-xl text-xs overflow-auto border border-white/5 whitespace-pre-wrap max-h-48">
              {JSON.stringify(executionInstruction, null, 2)}
            </pre>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setExecutionInstruction(null);
                  setConfirmedActionId(null);
                }}
                className="button-secondary"
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* DEEP DIVE MODAL */}
      {selectedAction && (
        <div className="modal-backdrop">
          <div className="modal-sheet bg-surface/95 border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.5)] font-mono backdrop-blur-xl overflow-hidden">
            <div className="overflow-y-auto flex-1 p-6 flex flex-col">
            <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
              <div>
                <span className="text-accent text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                  <Cpu size={14} /> {selectedAction.opportunity?.strategy}
                </span>
                <h2 className="text-2xl font-bold tracking-tight mt-1 flex items-center gap-2">
                  {selectedAction.opportunity?.symbol}{" "}
                  <span
                    className={`px-2 py-0.5 rounded-md text-sm ${selectedAction.opportunity?.direction === "long" || selectedAction.opportunity?.direction === "buy" ? "bg-positive/20 text-positive" : "bg-negative/20 text-negative"}`}
                  >
                    {selectedAction.opportunity?.direction?.toUpperCase()}
                  </span>
                </h2>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-muted">
                  <span className="truncate" title={selectedAction.id}>
                    Action ID: {selectedAction.id}
                  </span>
                  <button
                    onClick={() => copyActionId(selectedAction.id)}
                    className="text-accent hover:text-white uppercase"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <button
                onClick={() => setSelectedAction(null)}
                className="text-muted hover:text-white transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 text-sm custom-scrollbar pr-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background/40 border border-white/5 rounded-xl p-3 flex flex-col justify-center items-center">
                  <div className="text-muted text-[10px] uppercase tracking-widest mb-1">Confidence</div>
                  <div className="text-white font-bold text-lg">
                    {((selectedAction.opportunity?.confidence || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-background/40 border border-white/5 rounded-xl p-3 flex flex-col justify-center items-center">
                  <div className="text-muted text-[10px] uppercase tracking-widest mb-1">Suggested</div>
                  <div className="text-white font-bold text-lg">
                    {formatUsd(selectedAction.opportunity?.suggestedSizeUsd || 0)}
                  </div>
                </div>
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-accent/5 animate-pulse" />
                  <div className="text-accent text-[10px] uppercase tracking-widest mb-1 relative z-10">Final Size</div>
                  <div className="text-accent font-bold text-xl relative z-10">
                    {formatUsd(selectedAction.opportunity?.finalSizeUsd || 0)}
                  </div>
                </div>
              </div>

              <div className="border border-accent/20 bg-accent/5 rounded-xl p-4">
                <h3 className="text-accent uppercase tracking-widest text-[10px] mb-3 flex items-center gap-1">
                  <LockKeyhole size={12} /> Execution preview
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted block uppercase text-[9px]">Venue</span>
                    <strong>{selectedAction.opportunity?.venue}</strong>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[9px]">Data context</span>
                    <strong
                      className={selectedAction.executionContext === "mcp_live" ? "text-positive" : "text-accent"}
                    >
                      {actionDataContextLabel(selectedAction)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[9px]">Execution</span>
                    <strong className={isMcpLiveAction(selectedAction) ? "text-positive" : "text-accent"}>
                      {actionContextLabel(selectedAction)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[9px]">Entry</span>
                    <strong>{selectedOrderPreview?.side ?? "MCP preflight required"} MARKET</strong>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[9px]">Reference</span>
                    <strong>
                      {selectedOrderPreview ? formatUsd(selectedOrderPreview.reference) : "Live price required"}
                    </strong>
                  </div>
                  {selectedOrderPreview?.isSpotExit ? (
                    <div className="col-span-2 text-muted">Spot exit/rebalance: no new stop-loss is attached.</div>
                  ) : selectedOrderPreview ? (
                    <>
                      <div>
                        <span className="text-muted block uppercase text-[9px]">Hard stop</span>
                        <strong className="text-negative">
                          {formatUsd(selectedOrderPreview.stop)} · {formatPct(selectedOrderPreview.stopPct)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted block uppercase text-[9px]">Take profit</span>
                        <strong className="text-positive">
                          {formatUsd(selectedOrderPreview.takeProfit)} · {formatPct(selectedOrderPreview.takeProfitPct)}
                        </strong>
                      </div>
                      {selectedOrderPreview.trailingStopPct !== undefined && (
                        <div className="col-span-2">
                          <span className="text-muted block uppercase text-[9px]">Trailing protection</span>
                          <strong>{formatPct(selectedOrderPreview.trailingStopPct)} from peak</strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="col-span-2 text-accent">
                      The confirmed agent must fetch current price and exchange filters before producing valid
                      quantities and absolute protection prices.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-muted uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1">
                  <Activity size={12} /> Engine Rationale
                </h3>
                <div className="bg-background/40 p-4 rounded-xl border border-white/5 text-gray-300 leading-relaxed text-sm">
                  {selectedAction.opportunity?.rationale || "No rationale provided."}
                </div>
              </div>

              <div>
                <h3 className="text-muted uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1">
                  <ShieldAlert size={12} /> Risk Manager
                </h3>
                <div className="bg-background/40 p-4 rounded-xl border border-white/5">
                  <ul className="list-disc list-inside space-y-2 text-gray-300 text-sm">
                    {selectedAction.opportunity?.riskNotes?.map((note: string, idx: number) => (
                      <li key={idx} className="leading-snug">
                        {note}
                      </li>
                    ))}
                    {(!selectedAction.opportunity?.riskNotes || selectedAction.opportunity.riskNotes.length === 0) && (
                      <li className="text-muted">No risk adjustments applied.</li>
                    )}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-muted uppercase tracking-widest text-[10px] mb-2">Raw Data</h3>
                <pre className="bg-black/50 text-gray-400 p-4 rounded-xl text-[10px] overflow-x-auto border border-white/5 max-h-40">
                  {JSON.stringify(selectedAction.opportunity?.raw || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/10 flex-shrink-0">
              <button
                onClick={() => {
                  handleAction(selectedAction.id, "reject");
                  setSelectedAction(null);
                }}
                disabled={!!actionInFlight}
                className="flex items-center justify-center gap-2 border border-negative/50 text-negative rounded-xl py-3 font-bold hover:bg-negative/10 transition-all uppercase tracking-wider text-xs sm:text-sm"
              >
                <XCircle size={16} /> Reject
              </button>
              <button
                onClick={() => {
                  handleAction(selectedAction.id, "confirm");
                  setSelectedAction(null);
                }}
                disabled={!!actionInFlight || !isMcpLiveAction(selectedAction)}
                title={
                  isMcpLiveAction(selectedAction)
                    ? "Generate the instruction after confirmation"
                    : "Demo, paper, and legacy actions cannot create live instructions"
                }
                className="flex items-center justify-center gap-2 bg-accent/20 text-accent border border-accent/50 rounded-xl py-3 font-bold hover:bg-accent hover:text-background transition-all uppercase tracking-wider text-xs sm:text-sm shadow-[0_0_20px_rgba(229,169,58,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle size={16} /> {isMcpLiveAction(selectedAction) ? "Confirm" : "Demo only"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="terminal-header">
        <div className="header-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-2">
              <span className="status-dot status-dot-live" /> AETHER / LOCAL CONTROL PLANE
              <span className="ml-3 opacity-60">mjx</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-[-0.04em] text-white leading-tight">
              Decision surface for agentic execution
            </h1>
            <p className="text-muted text-xs sm:text-sm mt-2 max-w-xl leading-relaxed">
              Deterministic signals, explicit risk limits, and a human-confirmed handoff to Binance Agent OS.
            </p>
          </div>
        </div>
        <div className="header-actions">
          {error ? (
            <span className="status-pill status-pill-danger">
              <XCircle size={13} /> STATE OFFLINE
            </span>
          ) : isGlobalHalt ? (
            <span className="status-pill status-pill-danger">
              <ShieldAlert size={13} /> RISK HALT
            </span>
          ) : (
            <span className="status-pill status-pill-live">
              <CheckCircle size={13} /> STATE SYNCED
            </span>
          )}
          <div className="header-btn-group">
            <button onClick={() => setShowCommandCenter(true)} className="button-secondary">
              <Terminal size={13} /> CMD
            </button>
            <button onClick={() => setShowLogTrade(true)} className="button-secondary">
              <Database size={13} /> LOG
            </button>
            <button
              onClick={handleScan}
              disabled={scanning || !!error}
              title={
                accountContext?.executionContext === "mcp_live"
                  ? "Explicitly switch from the MCP context to a public DEMO / PAPER scan"
                  : "Uses public market data. Use Codex for a fresh Binance MCP account-aware scan."
              }
              className="button-primary"
            >
              <Radar size={13} />{" "}
              {scanning
                ? "SCANNING..."
                : accountContext?.executionContext === "mcp_live"
                  ? "DEMO SCAN"
                  : "MARKET SCAN"}
            </button>
          </div>
        </div>
      </header>

      <section className="metric-strip mb-8" aria-label="System overview">
        <div className="metric-card">
          <div className="metric-label">
            <LockKeyhole size={13} /> Approval queue
          </div>
          <div className="metric-value">{pending.length.toString().padStart(2, "0")}</div>
          <div className="metric-foot">{pending.length ? "requires review" : "clear"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <ArrowUpRight size={13} /> Tracked equity
          </div>
          <div className="metric-value">{latestEquity ? formatUsd(latestEquity) : "—"}</div>
          <div className="metric-foot">paper/live context</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <ShieldAlert size={13} /> Drawdown
          </div>
          <div className={`metric-value ${liveDrawdown >= (currentGoals?.maxDrawdownPct ?? 1) ? "text-negative" : ""}`}>
            {formatPct(liveDrawdown)}
          </div>
          <div className="metric-foot">limit {currentGoals ? formatPct(currentGoals.maxDrawdownPct) : "—"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Cpu size={13} /> Strategy mesh
          </div>
          <div className="metric-value">{activeStrategies.toString().padStart(2, "0")}</div>
          <div className="metric-foot">{confirmedCount} confirmed actions</div>
        </div>
      </section>

      <section className="context-strip mb-8" aria-label="Account context">
        <div className="context-primary">
          <div className="eyebrow">
            <Database size={13} /> Account context
          </div>
          <div className="context-title">
            {accountContext ? accountSourceLabel : "No account snapshot yet"}
            {accountContext && (
              <span className={`context-mode context-mode-${accountContext.mode}`}>
                {accountContext.executionContext === "mcp_live"
                  ? accountContext.mode === "live"
                    ? "MCP LIVE ACCOUNT"
                    : "MCP DATA / PAPER"
                  : "DEMO / PAPER"}
              </span>
            )}
          </div>
          <p className="context-copy">
            {accountContext
              ? `Captured ${new Date(accountContext.capturedAt).toLocaleString()} · ${accountContext.openPositions} open position${accountContext.openPositions === 1 ? "" : "s"}`
              : "Run a read-only MCP scan and pass --portfolio to populate this snapshot."}
          </p>
        </div>
        <div className="context-stat">
          <span>Equity used by engine</span>
          <strong>{accountContext ? formatUsd(accountContext.totalEquityUsd) : "—"}</strong>
        </div>
        <div className="context-stat">
          <span>Snapshot drawdown</span>
          <strong>{accountContext ? formatPct(accountContext.currentDrawdownPct) : "—"}</strong>
        </div>
        <div className="context-stat context-stat-wide">
          <span>Venue collateral</span>
          <strong className="context-collateral">
            {accountContext?.availableBalancesUsd
              ? `S ${formatUsd(accountContext.availableBalancesUsd.spotUsd)} · ` +
                `M ${formatUsd(accountContext.availableBalancesUsd.marginUsd)} · ` +
                `U ${formatUsd(accountContext.availableBalancesUsd.usdmFuturesUsd)} · ` +
                `C ${formatUsd(accountContext.availableBalancesUsd.coinmFuturesUsd)}`
              : "Not supplied"}
          </strong>
        </div>
        <div className="context-stat">
          <span>Spot base assets</span>
          <strong>{spotAssetValueUsd === undefined ? "Not supplied" : formatUsd(spotAssetValueUsd)}</strong>
        </div>
      </section>

      <section className="terminal-panel mb-8 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="eyebrow">
              <ShieldAlert size={13} /> Risk policy
            </div>
            <p className="text-xs text-muted mt-2">
              Preset limits apply to future scans. Existing approvals remain unchanged.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <select
              value={selectedProfile}
              onChange={(event) => setSelectedProfile(event.target.value as RiskProfileId)}
              className="field-control min-w-[13rem]"
            >
              {RISK_PROFILE_LIST.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleApplyProfile}
              disabled={savingProfile}
              className="button-primary disabled:opacity-50"
            >
              {savingProfile ? "Applying..." : "Apply Profile"}
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div className="text-xs text-gray-400">
            Active:{" "}
            <span className="text-accent font-bold">
              {currentProfile?.label ?? currentGoals?.profile ?? "Not configured"}
            </span>
            {currentProfile && <span> — {currentProfile.description}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider">
            <span className="policy-chip">DD {currentGoals ? formatPct(currentGoals.maxDrawdownPct) : "—"}</span>
            <span className="policy-chip">Position {currentGoals ? formatPct(currentGoals.maxPositionPct) : "—"}</span>
            <span className="policy-chip">Leverage {currentGoals ? `${currentGoals.maxLeverage}x` : "—"}</span>
            <span className="policy-chip">Min conf {currentGoals ? formatPct(currentGoals.minConfidence) : "—"}</span>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        {/* Left Column */}
        <div className="space-y-8">
          {/* Equity Chart */}
          <section className="terminal-panel p-6 relative overflow-hidden">
            <div className="chart-ornament" aria-hidden="true" />
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="eyebrow">
                  <Activity size={13} /> Performance telemetry
                </div>
                <h2 className="text-lg font-medium text-white mt-2">Equity curve</h2>
              </div>
              <span className="text-[10px] text-muted font-mono uppercase tracking-wider">
                {equityCurve.length} samples
              </span>
            </div>
            <div className="h-[240px] sm:h-[280px] w-full">
              {equityCurve.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2E2A" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(val) =>
                        new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      }
                      stroke="#788075"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#788075"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `$${val}`}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#121412", border: "1px solid #2A2E2A", borderRadius: "8px" }}
                      itemStyle={{ color: "#E5A93A" }}
                      labelStyle={{ color: "#788075", fontSize: "12px" }}
                      formatter={(val) => (val != null ? [`$${Number(val).toFixed(2)}`, "Equity"] : ["-", "Equity"])}
                      labelFormatter={(label) => new Date(String(label)).toLocaleString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalEquityUsd"
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorEquity)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted font-mono text-sm border-2 border-dashed border-white/5 rounded-xl">
                  AWAITING DATA
                </div>
              )}
            </div>
          </section>

          {/* Performance & Audit Log Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="terminal-panel p-6">
              <h2 className="eyebrow mb-6">
                <Cpu size={13} /> Strategy yield
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead className="text-muted border-b border-white/10">
                    <tr>
                      <th className="pb-3 font-medium">Strategy</th>
                      <th className="pb-3 font-medium">Trades</th>
                      <th className="pb-3 font-medium">Win %</th>
                      <th className="pb-3 font-medium text-right">Avg PnL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(Object.values(state?.memory?.performance || {}) as StrategyPerformance[]).map(
                      (p: StrategyPerformance) => (
                        <tr key={p.strategy} className="hover:bg-white/5 transition-colors group">
                          <td className="py-3 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${p.paused ? "bg-negative" : "bg-accent"}`} />
                            <span className="truncate max-w-[100px] sm:max-w-[150px]">{p.strategy}</span>
                          </td>
                          <td className="py-3">{p.trades}</td>
                          <td className="py-3 text-gray-300">{p.trades > 0 ? formatPct(p.winRate) : "—"}</td>
                          <td
                            className={`py-3 text-right font-medium ${p.trades > 0 ? (p.totalPnlUsd >= 0 ? "text-positive" : "text-negative") : "text-muted"}`}
                          >
                            {p.trades > 0 ? formatUsd(p.totalPnlUsd / p.trades) : "—"}
                          </td>
                        </tr>
                      ),
                    )}
                    {perf.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted">
                          Awaiting sync...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="terminal-panel p-6">
              <h2 className="eyebrow mb-6">
                <ArrowUpRight size={13} /> Recent outcomes
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead className="text-muted border-b border-white/10">
                    <tr>
                      <th className="pb-3 font-medium">Symbol</th>
                      <th className="pb-3 font-medium">Dir</th>
                      <th className="pb-3 font-medium">Size</th>
                      <th className="pb-3 font-medium text-right">PnL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {trades.map((t: TradeRecord) => (
                      <tr key={t.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 font-bold text-gray-300">{t.symbol}</td>
                        <td
                          className={`py-3 uppercase ${t.direction === "long" || t.direction === "buy" ? "text-positive" : "text-negative"}`}
                        >
                          {t.direction}
                        </td>
                        <td className="py-3">{formatUsd(t.sizeUsd)}</td>
                        <td
                          className={`py-3 text-right font-medium ${t.pnlUsd !== undefined && t.pnlUsd > 0 ? "text-positive" : t.pnlUsd !== undefined && t.pnlUsd < 0 ? "text-negative" : t.outcome === "open" || t.pnlUsd === undefined ? "text-muted" : "text-accent"}`}
                        >
                          {t.outcome === "open" || t.pnlUsd === undefined ? "OPEN" : formatUsd(t.pnlUsd)}
                        </td>
                      </tr>
                    ))}
                    {trades.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted">
                          No recent trades
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="terminal-panel p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="eyebrow">
                  <Terminal size={13} /> Audit ledger
                </div>
                <p className="text-xs text-muted mt-2">Durable action state from the local control plane.</p>
              </div>
              <span className="text-[10px] font-mono text-muted uppercase">latest 06</span>
            </div>
            <div className="space-y-2">
              {recentActions.map((action) => (
                <div key={action.id} className="ledger-row">
                  <div className={`ledger-status ledger-status-${action.status}`}>
                    <CircleDot size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-white">
                      <span className="truncate">{action.opportunity?.strategy}</span>
                      <span className="text-muted">/</span>
                      <span className="text-muted truncate">{action.opportunity?.symbol}</span>
                    </div>
                    <div className="text-[10px] text-muted font-mono mt-1 flex items-center gap-1">
                      <Clock3 size={10} /> {new Date(action.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className={`ledger-label ledger-label-${action.status}`}>{action.status}</span>
                </div>
              ))}
              {recentActions.length === 0 && (
                <div className="text-xs text-muted font-mono py-3">No actions recorded yet.</div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Pending Approvals */}
        <section className="pending-sidebar" aria-label="Pending approvals">
          <div className="flex items-center justify-between mb-5">
            <h2 className="eyebrow">
              <LockKeyhole size={13} /> Pending approvals
            </h2>
            {pending.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="queue-badge">{pending.length} REQ</span>
                <button onClick={handleClearPending} disabled={clearingPending} className="button-danger-quiet">
                  {clearingPending ? "Clearing..." : "Reject all"}
                </button>
              </div>
            )}
          </div>

          <div className="pending-scroll-area">
            {pending.map((a) => (
              <div key={a.id} className="action-card group shrink-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50 group-hover:opacity-100 transition-opacity" />

                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="eyebrow text-accent">{a.opportunity?.strategy}</span>
                      <span
                        className={`text-[9px] font-mono tracking-wider ${isMcpLiveAction(a) ? "text-positive" : "text-muted"}`}
                      >
                        {actionContextLabel(a)}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                      {a.opportunity?.symbol}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md uppercase tracking-wider ${a.opportunity?.direction === "long" || a.opportunity?.direction === "buy" ? "bg-positive/20 text-positive" : "bg-negative/20 text-negative"}`}
                      >
                        {a.opportunity?.direction}
                      </span>
                    </h3>
                  </div>
                  <span className="font-mono text-lg font-light text-white">
                    ${a.opportunity?.finalSizeUsd?.toFixed(2) ?? "—"}
                  </span>
                </div>

                <div className="text-xs text-gray-400 line-clamp-2 mb-4 font-mono leading-relaxed">
                  {a.opportunity?.rationale}
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted mb-1">
                    <span>Confidence</span>
                    <span>{((a.opportunity?.confidence ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="confidence-track">
                    <div style={{ width: `${Math.max(0, Math.min(100, (a.opportunity?.confidence ?? 0) * 100))}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mb-3 text-[10px] font-mono text-muted">
                  <span className="truncate" title={a.id}>
                    ID: {a.id}
                  </span>
                  <button
                    onClick={() => copyActionId(a.id)}
                    className="shrink-0 text-accent hover:text-white uppercase"
                  >
                    Copy ID
                  </button>
                </div>

                <div className="flex justify-between items-center mt-2 pt-4 border-t border-white/5">
                  <button
                    onClick={() => setSelectedAction(a)}
                    className="text-xs font-mono text-accent hover:text-white transition-colors uppercase tracking-wider underline decoration-accent/30 underline-offset-4"
                  >
                    Deep Dive
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(a.id, "reject")}
                      disabled={!!actionInFlight}
                      className="border border-white/10 text-gray-300 rounded-lg px-4 py-2 hover:bg-negative/20 hover:text-negative hover:border-negative/50 transition-all uppercase tracking-wider text-xs font-bold"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(a.id, "confirm")}
                      disabled={!!actionInFlight || !isMcpLiveAction(a)}
                      title={
                        isMcpLiveAction(a)
                          ? "Generate execution instruction"
                          : "Demo, paper, and legacy actions are simulation-only"
                      }
                      className="bg-accent/10 text-accent border border-accent/30 rounded-lg px-4 py-2 hover:bg-accent hover:text-background transition-all uppercase tracking-wider text-xs font-bold shadow-[0_0_10px_rgba(229,169,58,0.1)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isMcpLiveAction(a) ? "Confirm" : "Demo only"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {pending.length === 0 && (
              <div className="border border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center text-muted font-mono text-sm bg-surface/20">
                <CheckCircle size={32} className="opacity-20 mb-3" />
                ALL CAUGHT UP
                <br />
                NO PENDING ACTIONS
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
