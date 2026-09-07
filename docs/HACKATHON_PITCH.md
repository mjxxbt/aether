# Hackathon Pitch and Judge Walkthrough

This is the short pitch deck outline for a live presentation or narrated
screen recording. Target length: **3 minutes**. Keep the product visible and
move to the working demo quickly.

## Slide 1 — Aether in one sentence (15 seconds)

**On screen:** Dashboard landing view and the one-line pitch.

Say:

> “Aether is a transparent Binance trading copilot that turns live context
> into risk-sized, explainable proposals, while keeping the human in control
> of every write action.”

The problem is not a lack of trading signals. It is the unsafe jump from an
agent's reasoning to an irreversible account action.

## Slide 2 — The control gap (20 seconds)

**On screen:** A simple three-step contrast:

```text
Opaque agent:  data → decision → order
Aether:        data → strategies → risk → explanation → human confirmation → tool
```

Say:

> “Aether separates research, risk, and execution. An AI agent can gather
> context through Binance Agent OS, but the local engine has no credentials and
> cannot place a trade. It can only produce a proposal and an execution
> instruction after explicit confirmation.”

## Slide 3 — How Binance Agent OS fits (20 seconds)

**On screen:** `docs/architecture.md` diagram.

Say:

> “The orchestrating agent owns the live Binance MCP and Skills connections.
> Binance supplies account and market context, Agentic Wallet and Skills add
> supported capabilities, and Aether provides the deterministic intelligence
> layer, memory, dashboard, and confirmation gate.”

The trust boundary matters: this repository deliberately does not contain
exchange credentials or a trading-write client.

The dashboard also separates provenance from permission: funded MCP data is
`MCP LIVE ACCOUNT`, zero/dust MCP data is `MCP DATA / PAPER`, real wallet/Skills
actions are `LIVE AGENT OS WALLET / SKILLS`, and public, offline, or non-MCP
scenario data is `DEMO / PAPER`. Only the real states can cross the confirmed execution
boundary.

## Slide 4 — The working loop (35 seconds)

**On screen:** Run the offline demo or a prepared live scan.

```bash
npm start -- demo --offline
```

Call out:

1. Strategies produce opportunities with confidence and rationale.
2. The risk manager sizes or rejects each opportunity.
3. An approved opportunity becomes a pending action with a unique ID.
4. The summary contains exact size, venue, direction, and risk adjustments.

Do not skip over rejected opportunities. They demonstrate that the system is
not just a signal generator.

## Slide 5 — Risk is selectable and explainable (25 seconds)

**On screen:** Risk Profile selector and Deep Dive modal.

Show the five profiles:

- Capital Preservation
- Conservative
- Balanced
- Growth
- Aggressive

Say:

> “The user selects the risk envelope. The profile changes future scans, not
> existing approvals. Every action shows the applied limits and the final
> rounded size. If rounding would produce a zero-dollar action, the engine
> rejects it instead of creating a meaningless approval.”

## Slide 6 — The confirmation boundary (30 seconds)

**On screen:** Action ID, Deep Dive, Confirm button, execution-instruction modal.

Show a funding-rate-neutral proposal if available. Point out:

- The perp leg and spot hedge leg appear in one approval.
- The Action ID is visible and copyable.
- Existing actions do not generate notifications on initial page load.
- A newly created batch generates one aggregated notification.
- Confirm changes the durable status and produces the instruction.

Say:

> “The dashboard is not the exchange adapter. It resolves the user's decision;
> the orchestrating agent must still read the instruction and make the
> separately authorized Binance MCP or Skills call.”

## Slide 7 — It learns without becoming opaque (20 seconds)

**On screen:** Strategy Yield table, recent trades, and equity curve.

Say:

> “Closed outcomes update strategy memory deterministically: wins add 0.05,
> losses subtract 0.08, weights are bounded, and three consecutive losses
> pause a strategy until a human resets it. The audit trail and equity curve
> make the changes inspectable.”

## Slide 8 — Why this is useful (15 seconds)

**On screen:** README safety notes and architecture summary.

Close with:

> “Aether makes an agentic trading workflow more legible and more governable.
> It is not a promise of profit; it is a reproducible control layer for
> analysis, risk, and human-approved action in Binance Agent OS.”

## Judge Q&A

### Does Aether place orders autonomously?

No. The engine has no trading-write credentials. It only creates a confirmed
execution instruction. The orchestrating agent is responsible for the actual
MCP or Skills call after confirmation.

### Why not let the LLM calculate the position size?

Sizing, drawdown, exposure, leverage, and rounding rules belong in tested code.
Keeping them deterministic makes the result repeatable and auditable.

### What happens with a zero-balance Agentic sub-account?

Aether keeps the provenance as MCP but explicitly enters `MCP DATA / PAPER`
using a $10,000 baseline for demonstration. No real order can be placed by
paper mode.

### What is the strongest differentiator?

The complete control loop: multi-strategy reasoning, deterministic risk
sizing, adaptive memory, human-readable evidence, durable Action IDs, and a
hard confirmation boundary in one reproducible workflow.

### What is not production-complete yet?

The local dashboard has no built-in authentication, the engine uses JSON-file
persistence rather than a database, and the backtest is a signal-quality test
without fees, slippage, or fill simulation. These limitations are disclosed
instead of hidden.
