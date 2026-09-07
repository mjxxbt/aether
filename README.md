# Aether — Adaptive Cross-Market Intelligence Agent

**Built by mjx** | [Twitter / X](https://x.com/mjxxbt) | [GitHub](https://github.com/mjxxbt/aether)

Built for the **Binance Agent OS Mini Hackathon** (Track A primary). The
repository can support an orchestrating agent's connected-MCP workflow, but
cloning this repository alone is not a Track B submission. Verify the official
deadline and rules before submitting.

Aether is a goal-oriented, multi-strategy, hybrid CEX + on-chain trading
agent that prioritizes **safety, adaptability, and transparency** over raw
signal-to-trade speed. It combines the official **Binance MCP Server**,
the **Agentic Wallet**, and **Skills Hub** with a small, deterministic,
fully local engine for strategy scoring, risk sizing, memory, and a
hard confirmation gate.

> Experimental hackathon software. Not financial advice. You are fully
> responsible for anything you confirm and execute.

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [Agent OS integration and live-proof workflow](docs/AGENT_OS_INTEGRATION.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Local API reference](docs/API.md)
- [FAQ](docs/FAQ.md)
- [Security and safety](docs/SECURITY_AND_SAFETY.md)

If you are using Codex, start with the short operating contract in
[AGENTS.md](AGENTS.md); it maps simple requests such as “run a read-only scan”
and “I confirmed Action ID …” to the full policy in [AGENT.md](AGENT.md).

## Deep Dive: Core Components

### 1. The Intelligence & Analysis Layer (`src/ingestor`)

Aether does not sit idle. Every time it scans, it executes concurrent, high-speed API requests to fetch real-world data:

- **Dynamic Market Discovery:** It connects to the live Binance API to instantly discover the Top 20 highest-volume USDT pairs across the market.
- **CEX Data:** The orchestrating agent can supply account and market context
  through MCP; the optional local ingestor reads public klines, tickers, and
  funding rates for a credential-free demo.
- **On-chain Data (Skills Hub):** Connects to the Binance Agent OS Skills Hub to run `meme-rush` and `query-token-audit`, discovering trending, audited tokens on BNB Chain.
- **Prediction Markets:** Discovers active binary prediction markets (via Agentic Wallet).

## Why this repo is split the way it is

The recommended implementation style for Agent OS is a tool-calling agent
loop running inside Claude Code / Cursor / Codex, which natively holds
the MCP and Skills Hub connections. So instead of re-implementing an MCP
client here, **this repo is the deterministic core**: strategy modules,
a risk manager, a memory store, and a confirmation gate — the parts that
should behave exactly the same way every time and be auditable. The optional
CLI ingestor only reads public Binance market data; it never places trades.
`AGENT.md` is the instruction set the
orchestrating agent (Claude Code, etc.) follows to wire this engine up to
live MCP + Skills data. See `docs/architecture.md` for the full diagram
and the trust-boundary reasoning.

This is still one Aether agent workflow: `AGENT.md` is its orchestrator policy
and this repository is its deterministic control plane. The supported AI
client owns the official Binance MCP session so authentication, permissions,
and Agentic sub-account isolation stay inside Binance Agent OS. The live-proof
sequence in [`docs/AGENT_OS_INTEGRATION.md`](docs/AGENT_OS_INTEGRATION.md)
shows exactly how the two surfaces work together.

## Data context versus execution mode

Aether labels these independently so demo data can never be mistaken for a
real account handoff:

| Context    | Typical source                                                    | Execution mode |       Can produce a live instruction? |
| ---------- | ----------------------------------------------------------------- | -------------- | ------------------------------------: |
| `mcp_live` | Funded Binance MCP account or real Agent OS wallet/Skills context | `live`         | Yes, after confirmation and preflight |
| `mcp_live` | Real MCP account with zero/dust funds                             | `paper`        |                                    No |
| `demo`     | Public REST, offline fixture, or non-MCP scenario file            | `paper`        |                                    No |

Only a proposal carrying both `executionContext:"mcp_live"` and
`executionMode:"live"` can reach the live execution boundary. Public scans,
offline demos, non-MCP scenario files, legacy actions, and paper actions are visibly
marked `DEMO / PAPER` or `MCP DATA / PAPER`. MCP source labels are operator attestations, not cryptographic evidence.
The engine requires explicit live context, complete balance maps, and a fresh
account timestamp; local operators must never relabel fixtures as MCP data.

## Quickstart

Use Node.js 22 or newer and npm. Both engine and dashboard dependencies must
be installed. The dashboard starts on 127.0.0.1 and rejects cross-origin API
requests; keep it local.

```bash
npm install
(cd web && npm install)
npm run build

# Run a public-market demo. This is always DEMO / PAPER and cannot execute.
npm start -- demo

# Run the same demo without network access or credentials
npm start -- demo --offline

# Start the unified web dashboard (http://localhost:3000)
npm run dashboard

# Run the test suite
npm test
```

> **Keep the dashboard private.** It is designed for a local hackathon demo
> and has no built-in user authentication. Bind it to localhost or place it
> behind an authenticated, private network before exposing it beyond your
> machine. A confirmed action is still only an execution instruction; the
> orchestrating agent must separately call the appropriate Binance MCP tool.

To actually run it live, connect the Binance MCP server in your agent
environment first:

```bash
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic
npx skills add https://github.com/binance/binance-skills-hub
```

Then open `AGENT.md` in that session and follow the loop it describes —
the agent fetches live data, hands it to this CLI, and shows you every
proposed action before anything executes.

## CLI reference

```
set-goals --goals <file|json>       Save risk goals to memory
score --scenario <file|json>        Run strategy modules, print weighted opportunities
propose --scenario <file|json>      Create demo or explicitly MCP-context proposals
propose --portfolio <file|json>     Use a sanitized Binance MCP account snapshot
confirm --id <id>                   Used by the dashboard to record confirmation
instruction --id <id>               Retrieve and revalidate a confirmed instruction
reject --id <id>                    Reject a pending action
pending                             List all currently pending actions
reject-all                          Reject all pending actions (explicit cleanup)
record-trade --trade <file|json>    Log a closed trade outcome and update strategy weights
report                              Print strategy performance + full audit log
reset-strategy --strategy <id>      Reset a paused/underperforming strategy's memory
backtest --data <klines.json>       Run the backtest harness on historical klines
demo                                Run a public-market paper demo

Flags:
  --json                            Machine-readable JSON output (all commands)
  --verbose                         (backtest only) print every simulated trade
```

`--scenario`, `--goals`, and `--trade` all accept either a path to a JSON
file or an inline JSON string. Data shapes are documented in `src/types.ts`
and validated with Zod schemas in `src/schemas.ts`.

For the real account-aware workflow, the connected AI client must write only
the sanitized aggregate MCP snapshot to a temporary file and run:

```bash
node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json
```

The `--portfolio` path records `portfolioSource:"binance_mcp"` and derives
`executionContext:"mcp_live"`. A funded account becomes `MCP LIVE ACCOUNT`;
a zero/dust account becomes `MCP DATA / PAPER`. Do not use `npm start -- demo`
as proof that account data reached Aether.

## What's implemented

### MVP (matches the spec's minimum viable product)

- [x] Natural-language goal handling (via `AGENT.md` + `set-goals`)
- [x] Live market data + account status via MCP (agent-side, see `AGENT.md`)
- [x] Eight strategy modules: funding-rate/basis, delta-neutral funding,
      momentum, on-chain alpha, convert/yield, prediction markets,
      portfolio rebalance, and sentiment
- [x] Confirm-before-execute on every trade/transfer, with a durable
      audit log (`src/execution/confirmationGate.ts`)
- [x] Performance memory / dynamic strategy weighting with auto-pause on
      losing streaks (`src/memory/store.ts`)
- [x] Risk manager: drawdown circuit breaker, position/on-chain exposure
      caps, leverage ceiling (`src/risk/riskManager.ts`)
- [x] Plain-English rationale on every opportunity + a `report` command
      for "why did you do that" questions

### Phase 1 — Enrichment

- [x] **Test suite** (`npm test`) — Jest + ts-jest, unit and CLI regression coverage for
      strategy behavior, risk manager, memory store, confirmation gate,
      and execution router
- [x] **Input validation** — Zod schemas for `RiskGoals`, `StrategyInput`,
      `TradeRecord`; clear field-level error messages on bad input
- [x] **Delta-neutral funding strategy** (`src/strategies/fundingRateNeutral.ts`)
      — paired spot + perp opportunity with one confirmation block and a
      two-phase, actual-fill-sized `pairedLegInstruction` in the execution
      router; the external calls are intentionally non-atomic
- [x] **Momentum refinements** — configurable `shortWindow` /
      `strongDivergencePct` via `goals.momentum`; RSI-style overextension
      filter down-weights exhausted moves
- [x] **On-chain alpha refinements** — tiered sizing (Tier 1/2/3 by
      liquidity + holders); address-level cooldown suppresses rejected
      tokens for configurable hours
- [x] **Memory enrichment** — per-symbol performance breakdown in `report`;
      equity curve history appended on each `propose` run
- [x] **CLI UX** — `--json` flag for machine-readable output on all
      commands; JSONL event log (`data/events.jsonl`)

### Phase 2 — New modules

- [x] **Prediction market strategy** (`src/strategies/predictionMarket.ts`)
      — naive fair-value edge model, safety gates, Agentic Wallet routing
- [x] **x402 payment example** (`src/execution/x402Payment.ts` +
      `docs/x402-example.md`) — full proposal/confirm flow through the
      gate; produces a `PaymentInstruction`, zero real payments
- [x] **Backtest harness** (`src/backtest/runBacktest.ts` +
      `src/backtest/buildScenarios.ts`) — steps through historical klines,
      simulates outcomes, writes separate `data/backtest_memory.json`
- [x] **Multi-agent orchestration docs** (`AGENT_ANALYST.md`,
      `AGENT_RISK.md`, `AGENT_EXECUTOR.md`) — role-specific instructions;
      `AGENT.md` explains single-session vs coordinated setup
- [x] **Unified Web Dashboard** (`npm run dashboard`, port 3000) — A sleek
      Next.js application providing visual equity tracking, strategy performance,
      risk-profile selection, and interactive Confirm/Reject controls directly
      in the browser. Features an interactive **"Deep Dive" modal** for
      processing actions and relies on atomic JSON file replacement to avoid
      partially-written state files.

### Phase 3 — Polish

- [x] Updated `docs/architecture.md` with all new modules and trust-boundary
      notes for prediction markets, x402, and the dashboard
- [x] `LICENSE` (MIT)
- [x] `CONTRIBUTING.md`
- [x] `docs/testing.md` (test suite + backtest usage)
- [x] `.github/workflows/ci.yml` (build + test on push/PR)
- [x] Expanded `docs/example-prompts.md` and `docs/demo-script.md`
- [x] Complete hackathon submission packet, pitch, operations, API, FAQ,
      security, changelog, and release-checklist documentation

## Project layout

```
src/
  types.ts                  Shared data contracts (all types incl. pairedLeg,
                              PredictionMarketSnapshot, EquityCurvePoint)
  schemas.ts                Zod validation schemas for CLI inputs
  events.ts                 JSONL structured event log
  config/persistence.ts     Atomic JSON persistence helper
  strategies/
    fundingRate.ts           Directional funding-rate / basis strategy
    fundingRateNeutral.ts    Delta-neutral funding strategy (NEW)
    momentum.ts              MACD momentum + RSI filter
    onchainAlpha.ts          Tiered on-chain alpha with cooldowns
    convertYield.ts          Convert / yield optimization
    predictionMarket.ts      Prediction market edge-scoring (NEW)
    portfolioRebalance.ts    Target-allocation rebalance strategy
    sentiment.ts             Deterministic sentiment adapter (paper-only)
    index.ts                 Strategy registry + performance weighting
  risk/riskManager.ts        Drawdown/position/on-chain/leverage caps
  execution/
    confirmationGate.ts      Human-confirm-before-execute + audit log
    executionRouter.ts       Confirmed action -> MCP/Skills instruction
                               (incl. pairedLegInstruction)
    x402Payment.ts           x402 micropayment proposal/confirm (NEW)
  memory/store.ts            JSON-backed goals, trade history, strategy weights,
                               equity curve, onchain cooldowns
  backtest/
    buildScenarios.ts        Historical klines -> StrategyInput snapshots (NEW)
    runBacktest.ts            Backtest harness + report (NEW)
  cli.ts                     Command-line entry point
examples/                    Offline demo and backtest fixtures
data/
  live_scenario.json         Auto-generated from live Binance data
  events.jsonl               JSONL event log (auto-created)
  memory.json                Live memory (auto-created)
  pending_actions.json        Audit log (auto-created)
  backtest_memory.json        Backtest-only results (never touches live memory)
docs/
  README.md                   Documentation map
  architecture.md            Diagram + trust boundary + all new modules
  RISK_PROFILES.md            Five selectable risk presets and their limits
  testing.md                 Test suite + backtest documentation (NEW)
  x402-example.md            x402 payment walkthrough (NEW)
  example-prompts.md         Natural-language prompts (expanded)
  OPERATIONS_RUNBOOK.md      Safe operator workflow and recovery
  API.md                     Local dashboard API reference
  FAQ.md                     User and judge FAQ
  SECURITY_AND_SAFETY.md     Threat model and emergency procedure
AGENT.md                     Orchestrating-agent instructions (index + roles)
AGENT_ANALYST.md             Analyst role — data fetch + score (NEW)
AGENT_RISK.md                Risk role — propose only (NEW)
AGENT_EXECUTOR.md            Executor role — confirm/reject + tool call (NEW)
CONTRIBUTING.md              Contribution guide (NEW)
LICENSE                      MIT (NEW)
SECURITY.md                  Vulnerability reporting and deployment warning
CHANGELOG.md                 Hackathon release history
tests/                       Jest test suite (NEW)
.github/workflows/ci.yml     CI workflow (NEW)
```

## Release verification

Run `npm run verify` for builds, tests, lint, and browser/API checks using
isolated temporary state. Install Chromium once with `npx playwright install chromium`.
No verification command places exchange orders.

## Safety notes (also in `AGENT.md`)

- The agent operates only inside an isolated Agentic sub-account; no
  external withdrawals are possible via MCP.
- Every non-read action requires explicit user confirmation — the engine
  will refuse to build an execution instruction for anything that isn't
  marked `confirmed` in the audit log.
- Fund only risk capital into the Agentic sub-account.
- This is experimental software, not financial advice.

## Key official resources

- Agent OS: https://www.binance.com/en/agent-os
- MCP Server docs: https://developers.binance.com/en/docs/agent-native/mcp-server
- Agentic MCP guide: https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- Agentic Wallet: https://developers.binance.com/en/docs/products/agentic-wallet/welcome
- Skills Hub: https://developers.binance.com/en/docs/sdks-tools/integrations/skills-hub
- Skills Hub GitHub: https://github.com/binance/binance-skills-hub
- Hackathon announcement: https://www.binance.com/en/square/post/362885563835358
