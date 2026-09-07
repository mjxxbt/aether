# Aether — Example Prompts

Copy and paste these directly into any supported AI client
(Claude Code, Claude Desktop, Codex CLI, ChatGPT, VS Code, Grok)
**after** connecting the Binance MCP and reading `AGENT.md`.

---

## 🚀 Session start (always do this first)

```
You are the Aether Orchestrator. Read AGENT.md in this project root.
Use only read-only Binance MCP/Skills tools for research. Keep demo/public
data separate from MCP account data, run the Aether engine, and show me
proposals. Never execute anything without my confirmation.
```

---

## 📊 Market scans

**Full scan — propose trades across top 20 markets:**
```
Fetch my live Binance Agentic sub-account balance via MCP,
fetch positions and venue balances too, write only the sanitized aggregate
portfolio to /tmp/aether-mcp-portfolio.json, then run:
  node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json
Show each proposal's data context and execution mode. Stop before any write
tool.
```

**Quick scan — see signals without creating pending actions:**
```
Run: node dist/cli.js score
Which strategies have active signals right now? Show confidence scores.
```

**Scan with a specific risk profile:**
```
Apply the Growth risk profile (12% max drawdown, 20% max position, 3x
leverage, 30% minimum confidence), then scan the markets and propose trades.
```

---

## ⚙️ Setting risk goals

**Aggressive preset (highest configured risk):**
```
Set my trading goals:
- Profile: aggressive
- Max drawdown: 20%
- Max position: 30% of equity
- Max leverage: 5x
- Min confidence: 25%
- Review every 12 hours
Save these goals.
```

**Conservative (capital preservation focus):**
```
Set my trading goals:
- Profile: conservative
- Max drawdown: 5%
- Max position: 10% of equity
- Max leverage: 1x (no leverage)
- Min confidence: 55%
- No on-chain exposure
Save these goals.
```

**Funding rate specialist:**
```
Set goals focused on funding rate arbitrage:
- Max drawdown: 5%, max position: 15%, max leverage: 2x,
  min confidence: 35%, on-chain exposure: 0%
Save and then scan for funding rate opportunities.
```

---

## ✅ Executing a confirmed trade

After you click CONFIRM in the dashboard:
```
I confirmed Aether Action ID <paste-id-here> in the Aether dashboard. The
dashboard has already recorded the confirmation; do not run aether confirm
again. Read AGENTS.md and docs/AGENT_OS_INTEGRATION.md, re-check this exact
action, perform every required read-only preflight, resolve the currently
exposed Binance MCP schema, show me the final order parameters and protection
plan, and wait for my explicit YES before any write. Execute only this Action
ID. Never execute a DEMO / PAPER or MCP DATA / PAPER action.
```

The dashboard displays this exact continuation prompt after confirmation and
lets you copy it directly into the connected Codex/Agent OS session.

---

## 📈 Strategy-specific scans

**Momentum signals:**
```
Which pairs have the strongest short-term momentum right now?
Run the engine and show me only momentum strategy proposals.
```

**Funding rate opportunities:**
```
What does the funding rate landscape look like across the top 20 pairs?
Flag any with rates above 0.03% — those are worth trading.
```

**Delta-neutral funding (earn funding, hedge price risk):**
```
I want to capture funding rate income without directional price exposure.
Propose a delta-neutral pair trade: short the perp, long the spot.
```

**On-chain alpha (BNB Chain trending tokens):**
```
Use the Binance Skills Hub to find audited trending tokens on BNB Chain
with at least $1M liquidity and a passing audit. Propose an on-chain trade.
```

**Portfolio rebalancer:**
```
Set my target allocation to 60% BTC, 40% ETH.
If the portfolio drifts more than 5% from target, propose a rebalance.
```

---

## 📋 Reports and audit

**Full performance report:**
```
Run: node dist/cli.js report
Show me win rates, PnL, and weights for every strategy.
Which strategies are performing and which should I consider resetting?
```

**Strategy deep dive:**
```
How has the funding_rate strategy specifically performed on BTCUSDT vs ETHUSDT?
Show me the per-symbol breakdown.
```

**Explain a past proposal:**
```
Why did you propose a short on ETHUSDT in the last scan?
Walk me through the exact math — MACD histogram, RSI, and risk sizing.
```

---

## 🔧 Maintenance

**Reset a losing strategy:**
```
The momentum strategy has been losing. Run:
  node dist/cli.js reset-strategy --strategy momentum
Confirm this clears its trade history and resets its weight to 1.0.
```

**Check pending actions:**
```
Run: node dist/cli.js pending
Show me all actions still waiting for confirmation.
```

**View equity curve:**
```
Run: node dist/cli.js report
Show me the equity curve — how has the paper portfolio tracked over time?
```

---

## 🔴 Emergency

**Stop all trading immediately:**
```
Run the emergency stop: set maxPositionPct to 0 in goals.
  node dist/cli.js set-goals --goals '{"profile":"halted","maxDrawdownPct":0.01,"maxPositionPct":0,"maxOnchainExposurePct":0,"maxLeverage":1,"minConfidence":1,"reviewIntervalHours":24}'
Confirm no new proposals will be generated until I update goals again.
```

**Reject all pending actions:**
```
Run: node dist/cli.js reject-all --json
I want a clean slate. Do not confirm any action.
```

---

## 💡 Tips

- The engine auto-fetches the **top 20 USDT pairs by volume** on every scan — no need to specify symbols.
- If your Agentic sub-account has **$0 balance**, the engine shows **MCP DATA /
  PAPER** and uses a $10,000 simulated baseline. It can demonstrate analysis
  and pending proposals, but paper actions are blocked from live execution;
  fund the appropriate Agentic wallet and run a fresh live scan before
  confirming anything.
- Public REST scans, offline fixtures, and scenarios without explicit validated
  MCP provenance show **DEMO / PAPER**. They do not prove that account data
  reached Aether and must never be relabeled as MCP data; the local engine trusts operator attestations.
- After clicking **CONFIRM** in the dashboard, always paste the action ID back to your agent so it knows which instruction to execute.
- The engine learns over time — **log every trade outcome** via the "LOG TRADE" button so strategy weights update correctly.
