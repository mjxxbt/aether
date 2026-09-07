# Architecture

## Diagram

```
User (NL Goals / Commands)
        |
        v
Orchestrating Agent — any officially supported Binance MCP client:
  Claude Code · Claude Desktop · Codex CLI · ChatGPT (web) · ChatGPT/Codex Desktop · VS Code · Grok Bot
  - holds the live Binance MCP session (https://agent.binance.com/mcp/agentic)
        |
        |  fetches data via MCP + Skills, assembles StrategyInput JSON
        v
+------------------------------------------------------------------+
|                   Aether Engine (this repo)                       |
|              -- no trading-write access or credentials --         |
|                                                                   |
|  Strategy Modules ──────────────> Risk Manager ──> Confirmation  |
|  ┌─────────────────────┐          (drawdown,        Gate         |
|  │ funding_rate         │          flash-crash halt◄─ NEW     │           |
|  │ funding_rate_neutral │          position/on-chain  │           |
|  │ momentum             │          caps, leverage)   │ audit log  |
|  │ onchain_alpha        │                            ▼           |
|  │ convert_yield        │                     Execution Router   |
|  │ prediction_market    │                     (returns tool-call  |
|  │ portfolio_rebalance ◄┤ NEW                  instruction,      |
|  └─────────────────────┘                       does not call it) |
|         ^                                                         |
|         |                                                         |
|   Memory Store (JSON)◄── strategy weights, equity curve,         |
|   goals, trades,          onchain cooldowns                       |
|   bySymbol perf                                                   |
|                                                                   |
|   events.jsonl                                                    |
+------------------------------------------------------------------+
        |
        |  prints "PROPOSED ACTION" — agent shows it to user verbatim
        v
User confirms / rejects
        |
        v (only on confirm)
Orchestrating Agent calls the actual tool:
  -> Binance MCP Server (Spot/Margin/Convert/Futures), OR
  -> Agentic Wallet skill (on-chain swap, prediction market, x402), OR
  -> Skills Hub premium endpoint (after x402 payment)
        |
        v
Trade result fed back via `record-trade` -> Memory Store updates weights

Trade result fed back via Web Dashboard Modal -> Memory Store updates weights

Unified Next.js Dashboard (NEW, port 3000):
  reads memory.json + pending_actions.json on each request
  Confirm/Reject buttons, Log Trade modal, and state polling through API routes
  dashboard controls for local operations; live MCP context still comes from
  the connected AI session.
```

## Trust boundary

The strategy, risk, memory, and execution modules are intentionally
credential-free and have no trading-write access. The optional ingestor reads
public Binance market data for the live demo, but never receives API keys or
places orders. This is a deliberate safety property, not an oversight: the only path from "the
engine thinks this is a good trade" to "money moves" runs through

1. the risk manager's deterministic caps,
2. a written confirmation summary that must be shown to the user, and
3. the orchestrating agent's own MCP/Skills tool call, which only happens
   after an explicit `confirmed` status exists in the audit log.

### Trust boundary for new modules (Phase 2)

**Prediction market strategy** (`src/strategies/predictionMarket.ts`):

- Scores `PredictionMarketSnapshot` objects handed in by the agent via
  `StrategyInput.predictionMarkets`.
- Routes confirmed actions to `agentic_wallet` via the execution router.
- No network access in the strategy module itself.

**x402 Payment** (`src/execution/x402Payment.ts`):

- Produces a `PaymentInstruction` via the confirmation gate.
- The agent performs the actual HTTP call using its Agentic Wallet.
- Appears in the audit log exactly like a trade.

**Unified Next.js Dashboard** (`web/` directory):

- Reads `data/memory.json` and `data/pending_actions.json` via Next.js API routes with centralized path resolution.
- Uses atomic JSON file replacement for goals and trade logs so readers never observe partial documents. CLI/dashboard mutations also use an exclusive state lock; busy callers retry.
  This is a local file transaction boundary, not an exchange execution ledger.
- API routes invoke the shared validated CLI; all short state transactions hold
  the same lock. Market requests occur before the proposal transaction.
- Features an interactive **"Deep Dive" modal UI** that centralizes pending action processing, allowing the user to view risk notes, rationale, and raw calculations before confirming or rejecting.
- Does NOT execute trades itself — it resolves the pending action status
  in the log; the orchestrating agent still reads the resulting
  `ExecutionInstruction` and makes the actual tool call.

## Why business logic lives in code, not prompts

Position sizing, drawdown math, and strategy-weight decay are exactly the
kind of thing that should be deterministic and testable rather than
re-derived by an LLM each time. Keeping them in `src/risk` and
`src/memory` means:

- the same scenario always produces the same sizing decision,
- the audit log shows the real numbers the code computed, not a
  paraphrase, and
- the orchestrating agent's job is simplified to "fetch data, run the
  CLI, show the output, wait for confirmation, call one tool" — a much
  smaller surface for something to go wrong.

## Strategy weighting rule (see `src/memory/store.ts`)

Starts every strategy at weight `1.0`. Each closed trade nudges it:
`+0.05` per win, `-0.08` per loss (losses penalized harder, on purpose —
capital preservation bias). Weight is clamped to `[0.1, 1.5]`. Three
consecutive losses force an auto-pause (`weight = 0`) until a human runs
`reset-strategy`. This is the "simple memory of recent strategy
performance → dynamic weighting" requirement from the spec, kept
intentionally simple and explainable for a hackathon judge to verify by
reading one file.

### Phase 1.6 additions to memory

- `bySymbol` per strategy: tracks wins/losses/PnL for each traded symbol
  so `report` can answer "how has BTC funding_rate trading gone."
- `equityCurve`: a timestamped `{timestamp, totalEquityUsd, drawdownPct}`
  point appended on every `propose` run, giving the dashboard a real
  history to chart.
- `onchainCooldowns`: tracks per-address rejection timestamps so the
  on-chain alpha strategy doesn't re-propose the same rejected token
  for the configured cooldown window (default 12 h).

## Delta-neutral funding strategy (Phase 1.3)

`funding_rate_neutral.ts` proposes a **paired** opportunity: short perp +
long spot (for positive funding) or long perp + a sale of held spot (for negative
funding; this replaces existing exposure and does not establish a new spot short). Both legs are sized equally for simplicity. The `pairedLeg`
field on `Opportunity` carries the hedge instruction, and
`confirmationGate.ts` shows both legs in a single confirmation block so
the user approves them together. The execution router emits a
`pairedLegInstruction` and a two-phase policy: the agent submits the hedge
only after the primary entry is confirmed FILLED and sizes it from the actual
fill. The external exchange calls are not exchange-atomic, so the executor
must stop and alert the user on a partial execution rather than blindly
continuing.

Simplifying assumptions documented in `fundingRateNeutral.ts`.

## Backtest harness (Phase 2.3)

`src/backtest/runBacktest.ts` steps through time-ordered `StrategyInput`
snapshots, runs the full pipeline, and simulates outcomes from next-step
prices. Results go to `data/backtest_memory.json` — the live
`data/memory.json` is never touched. Documented assumptions: no fill
simulation, no fees, no funding cost modeling.

## Remaining stretch goals

- Real-money backtest with fee/slippage modeling.
- Dynamic hedge ratio rebalancing for the delta-neutral strategy.
- Formal multi-agent session with separate Analyst/Risk/Executor roles
  (see `AGENT_ANALYST.md`, `AGENT_RISK.md`, `AGENT_EXECUTOR.md`).

## Related operating documents

- [Getting Started](GETTING_STARTED.md) — install and first run.
- [Operations Runbook](OPERATIONS_RUNBOOK.md) — live, paper, and recovery
  procedures.
- [Security and Safety](SECURITY_AND_SAFETY.md) — threat model and emergency
  stop.
- [Local API Reference](API.md) — dashboard routes and payloads.
- [Hackathon Submission Packet](HACKATHON_SUBMISSION.md) — demo evidence and
  external submission checklist.
