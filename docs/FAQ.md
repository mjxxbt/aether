# Frequently Asked Questions

## What is Aether?

Aether is a deterministic intelligence and control layer for an AI agent
working with Binance Agent OS. It evaluates multiple strategy families,
applies explicit risk limits, remembers outcomes, and presents auditable
proposals for human review.

## What is the primary goal?

The goal is to make agentic trading more transparent and governable. Aether
separates market analysis from risk sizing and from external execution. It is
not a promise of profitable trading.

## Does Aether place orders?

The local engine and dashboard do not place orders. After a user confirms an
Action ID, the engine returns an execution instruction. The orchestrating AI
agent may then call the authorized Binance MCP or Skills tool.

## Where do I find an Action ID?

Every pending card in the dashboard displays a visible, copyable Action ID.
The CLI equivalent is:

```bash
node dist/cli.js pending --json
```

Use the exact ID through the dashboard confirmation control only when the action is labeled
`MCP LIVE ACCOUNT`/`MCP LIVE` or `LIVE AGENT OS WALLET / SKILLS`; use
`reject --id` for any action. Never shorten or edit the ID.

## Why did I receive many notifications?

The dashboard silently synchronizes existing pending actions when it first
loads. When a new batch is created, it shows one aggregated notification for
the batch rather than one toast per action. The pending list remains the
source of truth.

If the list contains stale actions, review them and use **Reject all** only
when you intend to reject every pending action.

## Why did a risk-profile change not remove old approvals?

Risk profiles apply to future scans. Existing proposals are not silently
resized or invalidated because doing so would change what the user originally
reviewed. Reject stale actions, then scan again under the new profile.

## Which risk profile should I use?

Choose the profile that matches your own risk tolerance and use only risk
capital. The profiles are guardrails, not recommendations:

- Capital Preservation
- Conservative
- Balanced
- Growth
- Aggressive

See [RISK_PROFILES.md](RISK_PROFILES.md) for exact limits.

## What happens when my Binance sub-account has no balance?

Aether keeps the provenance as `mcp_live` but switches execution mode to
`paper`. The dashboard shows **MCP DATA / PAPER**, uses a $10,000 baseline for
risk-sizing demonstration, and blocks live instructions. A funded MCP scan is
required before any live action can be proposed.

## How do I know whether a proposal is real or a demo?

Read both labels on the dashboard and in the Action summary:

- **MCP LIVE ACCOUNT / MCP LIVE**: account data came through Binance MCP and
  the action may be confirmed after final preflight.
- **MCP DATA / PAPER**: account data came through MCP, but execution is blocked
  because the account is zero/dust or otherwise paper-mode.
- **LIVE AGENT OS WALLET / SKILLS**: a real prediction-market, on-chain, or
  x402 wallet workflow from the connected Agent OS client.
- **DEMO / PAPER**: public REST, offline, or a scenario without explicit
  validated MCP provenance; it can never produce a live execution instruction.

The engine expires pending and confirmed approvals when either the data context or execution
mode changes. Never edit an Action JSON record to change these labels.

## Can I run it without Binance access?

Yes:

```bash
npm start -- demo --offline
```

The offline demo uses the checked-in fixture at
`examples/demo-scenario.json`. It is the preferred recording and CI fallback.

## What data does the engine need for live sizing?

The orchestrating agent should provide Spot, USDⓈ-M, and COIN-M balances,
unrealized PnL, open positions, equity, high-water mark, drawdown, and market
snapshots. See the `PortfolioSnapshot` and `StrategyInput` contracts in
`src/types.ts`.

## Why are opportunities rejected?

Typical reasons include drawdown protection, a flash-crash halt, a confidence
floor, an exposure cap, a leverage ceiling, an on-chain safety gate, an active
cooldown, invalid input, or a final size that rounds to zero. A rejection is
an expected safety outcome, not necessarily a bug.

## Why does a live MCP scan contain a paper-only sentiment proposal?

The bundled sentiment strategy uses a deterministic demo adapter when no
external news/social feed is supplied. Aether marks that signal explicitly and
forces its action to `DEMO SIGNAL / PAPER`; a real MCP account does not make a
demo signal real. Supply and validate a real Agent OS signal source before
adding a live sentiment workflow.

## Why does the engine reject an empty `markets` array?

An omitted `markets` field means “auto-fetch public Binance market data.”
An empty array provides no market context and is therefore rejected. If you
want full control, provide a non-empty validated array.

## What does the backtest prove?

It checks signal behavior against historical candle fixtures. It does not
simulate real fills, fees, slippage, funding costs, or exchange rejection.
The bundled fixture is only a deterministic smoke test; backtest results are
not a performance guarantee.

## Is the dashboard safe to expose publicly?

No. The dashboard has no built-in authentication. Keep it on localhost or
behind an authenticated private network. See
[SECURITY_AND_SAFETY.md](SECURITY_AND_SAFETY.md).

## What should I do if an action is stale or the market changed?

Reject it and run a fresh scan. A confirmation is tied to the exact proposal;
it is not a blanket permission for a symbol or strategy.

## How do I stop the system?

Stop confirming, tell the orchestrating agent to stop Binance write calls,
reject stale pending actions if appropriate, revoke Agent OS permissions when
necessary, and stop the dashboard. See the emergency procedure in
[SECURITY_AND_SAFETY.md](SECURITY_AND_SAFETY.md).

## Is x402 a live payment path?

The repository contains a validated x402 proposal and confirmation example.
The engine creates a payment instruction but does not make the external
payment. The orchestrating agent must perform any real payment only after
confirmation and independent review.

## Is this financial advice?

No. Aether is experimental hackathon software. Users are responsible for
permissions, funds, confirmations, jurisdiction, and external execution.
