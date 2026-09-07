# Hackathon Submission Packet

This is the canonical submission checklist and copy pack for Aether. It is
written for the **Binance Agent OS Mini Hackathon**, with Aether positioned as
a **Track A** project: a safety-first AI-agent workflow built around Binance
Agent OS, the Binance MCP Server, Agentic Wallet, and Skills Hub.

> **Important:** repository documents cannot complete the required social post
> or survey. Replace every `[PASTE ...]` placeholder before submitting.

## Official event facts

Verify the final rules and eligibility on the [official Binance announcement](https://www.binance.com/en/square/post/362885563835358)
before submitting. The announcement currently describes:

- Track A: build an AI agent with Agent OS; submit a demo/video and GitHub
  repository.
- Track B: connect MCPs and trade; this is a separate activity from the
  Track A software submission.
- Social step: follow Binance and repost/quote-repost the announcement, then
  reply with the submission.
- Final step: complete the official survey.
- Current published deadline: **September 8, 2026 at 23:59 UTC**.

The event announcement also lists jurisdiction and eligibility restrictions.
The repository does not determine whether a person is eligible to participate.

## Submission metadata

Fill this section once, then copy it into the submission form or social post.

```text
Project name: Aether — Adaptive Cross-Market Intelligence Agent
Track: Track A — AI agent built with Binance Agent OS
Repository: https://github.com/mjxxbt/aether
Demo video: [PASTE PUBLIC VIDEO URL]
Live demo / screenshots: LOCAL DEMO
Builder / team: mjx
Contact: https://x.com/mjxxbt
Social submission: [PASTE POST URL AFTER PUBLISHING]
Survey confirmation: [PASTE CONFIRMATION OR CHECK OFF PRIVATELY]
```

## One-line pitch

**Aether is a transparent, adaptive Binance trading copilot that turns live
market and account context into risk-sized, explainable proposals — then
requires a human confirmation before any Binance action can happen.**

## Short description

Aether combines Binance Agent OS integrations with a deterministic local
engine for multi-strategy market analysis, risk sizing, performance memory,
and human-confirmed execution. An orchestrating AI agent fetches live Binance
data through MCP and Skills, the engine scores opportunities and creates
auditable action IDs, and the dashboard lets the user inspect rationale,
limits, paired legs, and execution instructions before deciding. The engine
has no credentials and cannot place trades by itself.

## Judge-facing value proposition

Most trading agents compress research, decision-making, and execution into a
single opaque step. Aether separates those responsibilities. Binance Agent OS
provides the live account, market, wallet, and skills surfaces; Aether adds a
repeatable intelligence and safety layer; the user remains the final authority
for every write action. This makes the workflow inspectable, testable, and
demonstrable even in paper mode.

## What the demo proves

The recording should show these moments in order:

1. The agent reads `AGENT.md` and fetches live or fixture data. For the live
   recording, the supported AI client must visibly invoke a Binance MCP read
   so judges can see the Agent OS connection.
2. Aether evaluates registered strategies and prints plain-English reasons.
3. The risk manager applies the selected profile, drawdown breaker, exposure
   caps, leverage ceiling, and confidence floor.
4. Each approved proposal receives a visible, copyable Action ID.
5. The dashboard opens a Deep Dive view with rationale, risk notes, size, and
   paired legs when applicable.
6. Existing approvals load silently; a new batch produces one aggregated
   notification rather than a notification storm.
7. For an eligible real action, clicking Confirm changes the durable action
   status and displays the execution instruction; demo and paper controls stay
   blocked, and the engine still does not call Binance.
8. The orchestrating agent can then call the appropriate Binance MCP or Skills
   tool, and a later trade outcome updates strategy memory.
9. The offline demo and backtest provide a deterministic fallback if live
   market access is unavailable during recording.

The recording must visibly distinguish the runtime states: `MCP LIVE ACCOUNT`
for funded MCP account data with live execution permission, `MCP DATA / PAPER`
for a real MCP account with no usable collateral, `LIVE AGENT OS WALLET /
SKILLS` for real wallet/Skills actions, and `DEMO / PAPER` for public, offline,
or non-MCP scenario data. Only the real MCP-live or Agent OS wallet/Skills states can
produce a live execution instruction.

The demo must never imply that a paper-mode result is a live fill or that a
backtest is a performance guarantee.

## Reproduction commands

Use a clean checkout for the recording or judge reproduction:

```bash
npm install
(cd web && npm install)
npm run build
npm test

# Deterministic, network-free demo
npm start -- demo --offline

# Dashboard, in a second terminal
npm run dashboard
# open http://localhost:3000

# Optional historical signal-quality check
npm run backtest -- --data examples/backtest-klines.json
```

For live mode, connect the Binance MCP server and Skills Hub in the
orchestrating AI client, then follow [AGENT.md](../AGENT.md). Never record
secrets, private account identifiers, or credentials in the video or repo.

## Submission copy

### Social-post version

```text
Introducing Aether, a safety-first Binance Agent OS trading copilot.

It combines MCP + Skills with a deterministic local engine for multi-strategy
analysis, risk sizing, adaptive memory, explainable proposals, and a hard
human confirmation gate. Every action has an auditable ID; the engine cannot
place orders by itself.

Demo: [VIDEO URL]
Code: [GITHUB URL]

#BinanceAgentOS
```

### 30-second verbal version

“Aether is the missing control layer between an AI agent and a Binance
account. The agent can fetch live context through Binance Agent OS, but it
cannot jump directly from a signal to a trade. Aether deterministically scores
strategies, sizes them against a selectable risk profile, explains the math,
creates an auditable Action ID, and waits for the user to confirm in the
dashboard. That gives us adaptive intelligence without giving up human
control.”

## Final submission checklist

- [ ] Public GitHub repository opens in a clean browser session.
- [ ] `README.md` explains the product in under two minutes.
- [ ] `docs/GETTING_STARTED.md` works from a fresh checkout.
- [ ] The offline demo succeeds without credentials or network access.
- [ ] The dashboard starts on port 3000 and shows Action IDs.
- [ ] The video shows one normal proposal and one paired-leg proposal.
- [ ] The video visibly shows a supported AI client invoking a real Binance
      MCP read before the Aether proposal flow.
- [ ] The video distinguishes the live MCP path from the optional public REST
      demo ingestor.
- [ ] The video labels `MCP LIVE ACCOUNT`, `MCP DATA / PAPER`, and
      `LIVE AGENT OS WALLET / SKILLS`, and `DEMO / PAPER` correctly.
- [ ] The video shows the confirmation gate and execution-instruction modal.
- [ ] The video clearly says the engine itself does not place orders.
- [ ] The video shows at least one risk-profile change or risk rejection.
- [ ] The video shows the adaptive memory/reporting path.
- [ ] The video includes the paper-mode and backtest limitations.
- [ ] No API keys, private URLs, real balances, or personal data appear in
      commits, terminal recordings, screenshots, or logs.
- [ ] `npm run build`, `npm test`, dashboard lint, and dashboard build pass.
- [ ] Social follow/repost/reply step completed.
- [ ] Official survey completed.
- [ ] Final submission URL and video URL are pasted into the metadata above.

## Claims we intentionally do not make

- Aether does not guarantee returns, fills, or execution success.
- Aether does not autonomously trade from this repository.
- A backtest does not model fees, slippage, funding costs, or real fills.
- Paper mode is not evidence of live profitability.
- The dashboard is not an authenticated public web application.
- Track B participation is not claimed by merely cloning this repository;
  Track B requires following the event's separate connected-MCP/trading rules.
