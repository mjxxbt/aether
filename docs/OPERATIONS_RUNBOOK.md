# Operations Runbook

This runbook is for a demo operator or a user running Aether after the
hackathon. It covers the safe path from startup to shutdown.

## Operating modes

| Mode                     | Data source                                                         |   Can the local engine place an order? | Best use                                              |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------: | ----------------------------------------------------- |
| Offline demo             | Bundled fixture                                                     |                                     No | Recording, judging, CI, onboarding                    |
| Demo / paper             | Public REST, offline, or non-MCP scenario                           |                                     No | Deterministic demonstration without account execution |
| MCP data / paper         | Real MCP account with zero/dust equity                              |                                     No | Account provenance without usable collateral          |
| Live proposal            | Funded MCP account context plus public market data                  |                                     No | Review proposals before an external tool call         |
| Wallet / Skills proposal | Real Agentic Wallet or Skills context                               |                                     No | Review prediction, on-chain, or x402 instructions     |
| Confirmed execution      | User-confirmed MCP-live/Agent OS Action ID plus orchestrating agent | The agent may call the authorized tool | Only after reviewing the exact instruction            |

The local engine never gains trading-write access in any mode.

## Start from a clean checkout

Requires Node.js 22 or newer.

```bash
npm install
(cd web && npm install)
npm run build
npm test
```

Start the dashboard in a separate terminal:

```bash
npm run dashboard
# open http://localhost:3000
```

Keep this dashboard private. It has no built-in authentication.

## Offline acceptance path

Use this before a presentation or after a fresh install:

```bash
npm start -- demo --offline
npm run backtest -- --data examples/backtest-klines.json
```

Expected behavior:

- the demo prints scored, risk-sized, and pending sections;
- every pending action has a unique Action ID;
- repeating the scan reuses an identical pending action instead of creating a
  duplicate;
- the backtest writes only `data/backtest_memory.json`.

## Live proposal path

1. Connect the orchestrating AI client to the official Binance MCP endpoint.
2. Read [AGENT.md](../AGENT.md) in the project root.
3. Fetch Spot, Margin, USDⓈ-M, and COIN-M balances and positions through MCP.
4. Compute a complete `PortfolioSnapshot`, including aggregate
   `availableBalancesUsd` and `spotAssetBalancesUsd`; do not invent missing
   balances. Use `{}` for the Spot asset map only when the read-only account
   response confirms no Spot base assets are held.
5. If equity and positions are both zero, tell the user that the run is paper
   mode and continue with the $10,000 baseline. The data context remains
   `mcp_live`, but execution mode is `paper`; this is not a live approval.
6. Set or verify the selected risk profile.
7. Write the sanitized snapshot to a temporary file with
   `portfolioSource:"binance_mcp"` and `executionContext:"mcp_live"`, then run
   `node dist/cli.js propose --portfolio <file>`. The dashboard will show
   `BINANCE MCP` plus either `MCP LIVE ACCOUNT` (funded/live mode) or
   `MCP DATA / PAPER` (zero/dust account). Wallet/Skills actions are labeled
   `LIVE AGENT OS WALLET / SKILLS`. A public scan shows `DEMO / PAPER` and its
   actions cannot be confirmed for execution.
8. Review the dashboard's account-context status, pending count, and each
   Action ID. **Public Market Scan** remains a public-market/paper fallback and
   does not prove that account data reached Aether. When an MCP context is
   active, the dashboard requires explicit confirmation before switching to
   that demo context because the switch expires MCP approvals.

The engine expects `"markets"` to be omitted for automatic public-market
ingestion or to contain a non-empty, fully validated array. Passing
`"markets": []` is intentionally rejected.

## Review and confirmation path

For each candidate:

1. Open **Deep Dive**.
2. Read the rationale, confidence, venue, exact final size, reference price,
   direction-aware stop-loss/take-profit preview, risk notes, and raw fields.
3. For delta-neutral actions, verify both the perp and spot legs.
4. Copy the Action ID if you need to reference it in the agent conversation.
5. Confirm only the exact action you intend to authorize.
6. Read the execution-instruction modal.
7. Copy the modal's **Next Codex / agent command** and paste it into the same
   AI session that owns the Binance MCP or Skills connection. Do not run
   `aether confirm` again; the dashboard already recorded the confirmation.
8. Let the orchestrating agent repeat read-only preflight, show final
   parameters and protection, and wait for the final explicit YES.
9. The orchestrating agent may then call only the indicated Binance MCP or
   Skills tool, subject to its current account checks.
10. Verify the external response before recording an outcome.

Confirmation is not a promise that Binance will accept an order. Symbols,
minimum notional, available balance, leverage, market status, and network
conditions can change between proposal and execution.

## Action ID reference

CLI commands:

```bash
node dist/cli.js pending --json
node dist/cli.js instruction --id '<confirmed-action-id>' --json
node dist/cli.js reject --id '<exact-action-id>' --json
node dist/cli.js reject-all --json
```

The dashboard shows the same ID and provides a Copy ID button. Do not edit an
ID or remove its suffix; the suffix prevents collisions between repeated scans.

## Risk-profile changes

Changing a profile applies to future scans. It does not silently resize,
confirm, or invalidate existing actions. After changing the profile:

1. review the current pending list against the new limits;
2. reject stale actions if necessary;
3. run a fresh scan;
4. confirm only proposals produced under the intended profile.

See [RISK_PROFILES.md](RISK_PROFILES.md) for the tested presets.

## Logging outcomes

After the external tool reports the result, record the outcome:

```bash
node dist/cli.js record-trade --trade '{
  "strategy":"momentum",
  "symbol":"BTCUSDT",
  "direction":"buy",
  "venue":"spot",
  "sizeUsd":100,
  "confidence":0.62,
  "outcome":"win",
  "pnlUsd":4.25,
  "notes":"Verified against the Binance response"
}'
```

Alternatively use the dashboard's **Log Trade** form. Do not log a trade as a
win merely because an instruction was created; log the actual external result.

## State and recovery

Back up the `data/` directory before experiments that matter. To inspect state:

```bash
node dist/cli.js report
node dist/cli.js pending --json
tail -n 50 data/events.jsonl
```

State mutations use an exclusive `data/state.lock`. A concurrent mutation
returns a retryable busy error. If a process crashes, stop all Aether processes
and preserve state before manually removing that exact lock file. Never remove
a lock while an operator or dashboard is still running.

A new proposal scan revokes previously confirmed instructions and pending
signals that no longer pass risk. Scoring is observational. The CLI requires
`--allow-context-switch` to replace an active MCP account with a demo scan.

If state is malformed, stop the dashboard and agent, preserve the files for
diagnosis, and restore from a known-good backup. Do not hand-edit a confirmed
action to bypass the gate.

## Shutdown and emergency stop

1. Stop confirming actions.
2. Stop the orchestrating agent from calling Binance write tools.
3. Reject stale pending actions only after reviewing them.
4. Revoke Agent OS permissions if the external account must be isolated.
5. Stop the dashboard process.

See [SECURITY_AND_SAFETY.md](SECURITY_AND_SAFETY.md) for the full incident
procedure.
