# Aether — Getting Started

> **TL;DR:** Connect any supported AI agent to Binance via MCP, open the
> Aether dashboard, then tell your AI to scan the markets. All trade
> proposals go through the web UI — the local engine never executes orders; external writes require your
> explicit confirmation.

For a hackathon submission, use [HACKATHON_SUBMISSION.md](HACKATHON_SUBMISSION.md)
first. The [operations runbook](OPERATIONS_RUNBOOK.md) covers the full safe
workflow, while the [FAQ](FAQ.md) answers common user and judge questions.

---

## Step 1 — Connect your AI agent to Binance MCP

Follow the **official Binance guide** for your specific AI client.
It covers Claude Code, Claude Desktop, Codex CLI, ChatGPT, VS Code, and Grok:

> 📖 **Official Binance MCP Setup Guide:**
> **https://developers.binance.com/en/docs/agent-native/mcp-server/agentic**

The MCP endpoint used is: `https://agent.binance.com/mcp/agentic`

**Verify it works** by asking your AI:

> "Use the Binance MCP Server to show the current BTCUSDT price."

You should see a live price returned. If you do, move to Step 2.

---

## Step 2 — Fund your Binance Agentic Sub-Account

Your agent operates in an **isolated sub-account** — completely separate
from your main Binance account. The agent can never withdraw to external
addresses and can never pull funds from your main account.

To fund it:

1. Go to: **Profile → Dashboard → Sub-account → Asset Management → Transfer**
2. Transfer any amount you want to make available for agent trading.

> ⚠️ Only fund what you're comfortable letting the agent propose trades with.
> You can also skip this step and use **paper-trading mode** ($10,000
> simulated balance) — the engine falls back automatically when the
> sub-account balance is $0.

---

## Step 3 — Set up and start Aether

Install Node.js 22 or newer and npm. Download the source from the public
repository linked in the submission, or clone that repository’s actual URL.

```bash
# 1. Clone and install
# From the extracted or cloned project directory:
npm install
(cd web && npm install)
npm run build

# 2. Start the Web Dashboard (keep this running)
npm run dashboard
```

Open **http://localhost:3000** — this is your Command Center. All pending
trade proposals will appear here for your review and confirmation.

> **Security:** keep this dashboard on localhost or behind an authenticated
> private network. The hackathon dashboard has no built-in user login, so do
> not expose port 3000 directly to the public internet.

---

## Step 4 — Tell your AI to use Aether

Open your AI client (whichever one you connected in Step 1) and send this
single message:

> _"You are now the Aether Orchestrator. Read the file `AGENT.md` in the
> project root at `/path/to/aether`. Follow the Standard Loop."_

Replace `/path/to/aether` with your actual project path
(e.g. `~/Documents/aether`).

Your agent now understands the rules:

- Fetch live Binance data via MCP
- Feed it to the Aether engine for mathematical analysis
- **Never execute a trade without you clicking CONFIRM in the dashboard**

---

## Step 5 — Daily workflow

### Set your risk goals

Set goals through the CLI or ask the connected AI agent to do it:

```bash
node dist/cli.js set-goals --goals '{"profile":"conservative","maxDrawdownPct":0.05,"maxPositionPct":0.1,"maxOnchainExposurePct":0,"maxLeverage":1,"minConfidence":0.5,"reviewIntervalHours":4}'
```

The dashboard displays the current performance, equity curve, recent trades,
and pending approvals. Use its Risk Profile selector for the five tested
presets; use the CLI or agent for advanced custom goal values.

See [Risk Profiles](RISK_PROFILES.md) for the five selectable presets. The
dashboard also lets you select and apply a profile directly.

### Scan the markets

Either:

- Click **"Public Market Scan"** in the Web UI for the credential-free
  `DEMO / PAPER` market-data path, **or**
- Tell your AI agent:
  > _"Use only read-only Binance MCP tools. Fetch my live account balances and
  > positions, write only the sanitized aggregate `PortfolioSnapshot` to
  > `/tmp/aether-mcp-portfolio.json`, then run
  > `node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json`.
  > Stop at the pending Action IDs; do not call a write tool."_

The explicit `--portfolio` handoff is required to prove that account data
reached Aether. It is labeled `executionContext:"mcp_live"`. Running
`propose` without it is only a `DEMO / PAPER` public-market path and does not
use Binance account data.

When an MCP context is already active, the dashboard relabels the button
**"SWITCH TO DEMO SCAN"** and requires explicit confirmation before public
scanning. This prevents a public scan from silently replacing the MCP account
context or its pending approvals.

### Review & confirm

Pending proposals appear in the **right column** of the dashboard.

1. Click **"Deep Dive"** to see the mathematical rationale, confidence
   score, and exact risk sizing.
2. Copy the visible **Action ID** if you need to reference it in the agent
   conversation. Each proposal has a **Copy ID** button.
3. Click **"CONFIRM"** only when the card says **MCP LIVE ACCOUNT** and
   **MCP LIVE**. Demo, paper, and legacy cards are simulation-only; their
   confirmation button is disabled.
4. Paste the exact Action ID back to Codex. Codex must recheck price,
   permissions, filters, and the current MCP schema before any write call.
5. Click **"REJECT"** to skip.

If a previous scan created stale proposals, verify that none should be
executed and click **Reject all**. This rejects every pending action while
preserving the audit history. The CLI equivalent is:

```bash
node dist/cli.js reject-all --json
```

### Log the outcome

When a trade closes, click **"LOG TRADE"** in the top-right.
Enter the PnL and whether it was a win or loss. The engine updates
strategy confidence weights automatically. Weights affect ranking and
eligibility; they are not a guarantee of larger allocations.

---

## Quick reference — Copy-paste agent commands

These are the exact one-liners to send your AI agent for each scenario.
Copy, paste, and go.

### Start the MCP account-aware loop

```
You are the Aether Orchestrator. Read AGENT.md at /path/to/aether.
Use only read-only Binance MCP tools. Fetch my live account balances and
positions, write only a sanitized aggregate PortfolioSnapshot to
/tmp/aether-mcp-portfolio.json, then run:
  node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json
Show the pending proposals with their data context and execution mode. Do not
call any order, transfer, cancel, swap, or payment tool.
```

The sanitized snapshot must include aggregate `availableBalancesUsd` with
`spotUsd`, `marginUsd`, `usdmFuturesUsd`, and `coinmFuturesUsd` so the engine
can block orders aimed at an unfunded venue before MCP is called. It must also
include `spotAssetBalancesUsd` (base asset → USD value, or `{}` when no Spot
assets are held) so a Spot SELL can never oversell an unheld asset.

### Set goals via the agent

```
Apply the Growth risk profile: 12% max drawdown, 20% max position, 3x max
leverage, and 30% minimum confidence. Save it.
```

### Scan markets only (no proposal yet)

```
Fetch public Binance market data for a `DEMO / PAPER` signal scan and run:
  node dist/cli.js score
Show me which strategies have active signals right now.
```

### Execute a confirmed trade

```
I confirmed Aether Action ID <paste-id-here> in the dashboard. The dashboard
has already recorded the confirmation; do not run aether confirm again. Read
AGENTS.md and docs/AGENT_OS_INTEGRATION.md, recheck this exact action, perform
every required read-only preflight, resolve the current MCP schema, show me the
final order parameters and protection plan, and wait for my explicit YES before
any write. Execute only this Action ID and stop if anything differs.
```

The dashboard's post-confirmation dialog generates this command for you and
provides a **Copy command** button. Paste it into the same Codex or Agent OS
session that owns the Binance MCP connection. A dashboard confirmation creates
the execution instruction; it does not itself call Binance.

### Check strategy performance

```
Run: node dist/cli.js report
Show me which strategies are winning and which are losing.
```

### Reset a losing strategy

```
Run: node dist/cli.js reset-strategy --strategy momentum
Confirm this clears its history and resets its weight to 1.0.
```

---

## Troubleshooting

| Symptom                                  | Fix                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP not connecting                       | Follow the exact setup steps at the [official Binance guide](https://developers.binance.com/en/docs/agent-native/mcp-server/agentic) for your client |
| `totalEquityUsd: 0` / `MCP DATA / PAPER` | Real MCP account has no usable collateral — fund it or continue without live execution                                                               |
| `DEMO / PAPER` appears                   | The run used public, offline, or a non-MCP scenario; run the MCP account-aware flow to prove account context                                         |
| Agent passes `"markets": []` and crashes | Tell agent to omit `markets` from `--scenario` — engine auto-fetches                                                                                 |
| Action expired or already resolved       | Refresh state; retrieve a confirmed instruction with `instruction --id`, or run a fresh scan for an expired action                                   |
| No proposals generated                   | Market conditions don't meet confidence threshold — try again later or lower `minConfidence` in goals                                                |
| Too many pending approvals               | Review the IDs, then use **Reject all** to clear stale proposals before scanning again                                                               |
| Dashboard not loading                    | Make sure `npm run dashboard` is running in a separate terminal                                                                                      |

---

## Safety controls and limits

- ✅ **Confirmation Gate** — instruction generation requires a dashboard decision; the agent must separately obtain final parameter authorization
- ✅ **No withdrawal scope** — the agent cannot send funds to external addresses
- ✅ **Sub-account isolation** — completely separate from your main Binance account
- ✅ **Flash-Crash Circuit Breaker** — engine halts automatically on extreme volatility
- ✅ **Max Drawdown protection** — engine stops proposing trades if losses exceed your limit
- ✅ **Full audit log** — every proposed, confirmed, and rejected action is logged to `data/events.jsonl`

---

## Getting help

- **Aether issues:** Open a GitHub issue in this repo
- **Binance MCP questions:** [Binance Developer Community — MCP Server & Skills](https://dev.binance.vision/c/mcp-server-and-skills/21)
- **Official Binance MCP docs:** https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
