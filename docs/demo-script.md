# Demo Script

Suggested structure for the Binance Agent OS Mini Hackathon submission video.
Target: 3–5 minutes.

Use this with [HACKATHON_SUBMISSION.md](HACKATHON_SUBMISSION.md) and
[HACKATHON_PITCH.md](HACKATHON_PITCH.md). The submission packet contains the
copy-ready description and external submission checklist; this file is the
operator's shot-by-shot recording plan.

## Recording rules

- Prefer the offline fixture for a reproducible recording.
- If live MCP data is shown, redact balances, account identifiers, and
  private tool responses.
- Never show API keys, cookies, tokens, or an unredacted `data/` directory.
- Do not imply that a confirmed instruction is a completed fill.
- Say explicitly that the engine has no trading-write access.

## Pre-demo setup (do this before recording)

```bash
cd /path/to/aether
npm install
(cd web && npm install)
npm run build && npm test   # must be all green

# Start unified web interface (keep running in background)
npm run dashboard
```

## Segment 1 — What is Aether? (30 s)

Open the README. Explain:
- A deterministic credential-free engine (this repo), with an optional
  read-only public-market ingestor, plus a thin orchestrating agent
  layer following `AGENT.md`.
- Trust boundary: the engine can't trade on its own — it only scores and
  proposes. Any supported AI client (Claude Code, Claude Desktop, Codex CLI,
  ChatGPT, VS Code, Grok Bot) holds the live Binance MCP connection.
- Show the supported client invoking one read-only Binance MCP tool and its
  live response before running the local Aether proposal flow. This is the
  evidence that the submission is using Agent OS, not only a local strategy
  engine.
- Every write action requires explicit human confirmation via the Web Dashboard.
- MCP endpoint used: `https://agent.binance.com/mcp/agentic`

## Segment 2 — Run the public market demo (60 s)

Terminal. Show the build succeeds from a clean install:

```bash
npm install && npm run build
npm start -- demo --offline
```

Point out what just happened in the background:
- The engine loaded bundled ticker/kline/funding fixtures. This run is
  explicitly `DEMO / PAPER`; it does not contain Binance account data and
  cannot produce a live execution instruction.
- It ran the registered strategy modules, including Portfolio Rebalance. The
  bounded Sentiment adapter is explicitly a demo signal and any sentiment
  proposal remains paper-only until a real external signal feed is supplied.
- It applied risk sizing and checked the Flash-Crash Circuit Breaker.
- Each opportunity became a pending confirmation with a unique ID on the right side of the screen.

Click **"DEEP DIVE"** on one of the actions to show the math behind the trade.
Because this is a public-market demo, show that the card is labeled
`DEMO / PAPER` and the control says **"Demo only"** rather than confirming it.
Do not present a public demo action as an executable instruction.

The execution-instruction popup is shown later only for a funded MCP action.
Point out that it tells the orchestrating AI agent exactly which MCP tool to
call with valid `quantity` arguments, mandatory read-only exchange-filter
preflight, and direction-aware absolute stop-loss/take-profit prices — and the
engine never makes that call itself.

## Segment 3 — Delta-neutral funding strategy (30 s)

Show `funding_rate_neutral.ts` briefly. Highlight the `pairedLeg` field
in the confirmation gate output. Explain: "Instead of a naked perp short,
we propose both legs together — the user approves both or neither."

## Segment 4 — Unified Web Interface (60 s)

```bash
npm run dashboard
# open http://localhost:3000
```

Walk through:
- Show that this is a single Next.js app combining aesthetics with full CLI control.
- Show the configured risk goals from the CLI/agent and the dashboard state.
- Show the five Risk Profile presets and apply **Balanced** for the demo.
- Show the Strategy Yield table and the Recent Trades audit log.
- Show the Equity Curve chart.
- Click "Public Market Scan" (which calls the credential-free public
  market-data `propose` flow). For the Agent OS proof, show Codex first using
  read-only Binance MCP account tools, then running the MCP-backed
  `propose --portfolio` flow separately. A funded handoff must show `MCP LIVE
  ACCOUNT`; a zero/dust handoff must show `MCP DATA / PAPER`.
  If an MCP context is already active, the button says **SWITCH TO DEMO SCAN**
  and requires an explicit context-switch confirmation.

If the MCP handoff is funded, click Confirm only on the `MCP LIVE ACCOUNT` /
`MCP LIVE` action and show the `ExecutionInstruction` JSON modal. If it is
zero/dust, show `MCP DATA / PAPER` and its disabled **Demo only** control.
The instruction is what the orchestrating agent would act on; the engine never
calls the external tool itself.
Point out the visible/copyable Action ID and explain that confirmation is tied
to that exact ID.

## Segment 5 — Memory and reporting (30 s)

Click the **"LOG TRADE"** button in the top right of the dashboard.
Use an isolated `AETHER_DATA_DIR` for all mock results. Explicitly label the
recording as a simulation. Fill out the modal with a mock winning trade (e.g., BTCUSDT, Long, Size 1500, Win, $120 PnL) and submit it.

Show the **Strategy Yield** table update instantly. Mention that:
- Winning trades increase a strategy's weight automatically.
- A 3-trade losing streak auto-pauses the strategy.
- To reset a strategy, run `node dist/cli.js reset-strategy --strategy <id>`.

## Segment 6 — Backtest (optional, 30 s if time allows)

Create a minimal klines JSON file (see `src/backtest/buildScenarios.ts` for shape)
or use any historical CSV converted to the `Kline[]` format. Then:

```bash
npm start -- backtest --data examples/backtest-klines.json
```

Show the cumulative PnL, win rate, and per-strategy breakdown.
Note: this writes `data/backtest_memory.json` — live `data/memory.json` is untouched.

## Segment 7 — Safety summary (30 s)

Back to the README safety notes:
- Isolated Agentic sub-account — no external withdrawals possible via MCP.
- Confirm-before-execute on every action (trade, payment, on-chain swap).
- Full audit log of every proposed/confirmed/rejected action.
- Engine has no trading-write access — it cannot place trades by itself.

"This is experimental software, not financial advice."
