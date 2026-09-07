# Security, Safety, and Threat Model

Aether handles trading proposals, account context, and user approvals. This
document explains what the system protects, what it deliberately does not
protect, and how to operate it safely during a hackathon demo.

## Security boundary

```text
Binance MCP / Skills       external, permissioned capabilities
           |
           v
Orchestrating AI agent     holds the live connection and calls tools
           |
           v
Aether engine              credential-free analysis and confirmation state
           |
           v
Local dashboard            review, confirm/reject, and audit visibility
```

The engine does not store Binance credentials and does not call trading-write
tools. The dashboard does not place orders. A confirmed Action ID is an
authorization record and execution instruction; the orchestrating agent must
still make a separate tool call.

## Threat model

| Threat                                        | Control                                                                                                                                    | Residual risk                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| An LLM proposes an unsafe size                | Zod input validation and deterministic risk manager                                                                                        | Incorrect upstream account data can still produce incorrect sizing                                                                         |
| A stale approval is executed                  | Durable status, Action ID, idempotency checks, visible timestamps, strict expiration limits, and context-invalidation on switch            | The user must still review current market conditions                                                                                       |
| Many scans create duplicate approvals         | Pending-action identity deduplication                                                                                                      | Intentionally different opportunities can still create separate actions                                                                    |
| Existing actions flood the UI                 | Silent initial sync and aggregated new-action toast                                                                                        | Users must still review the pending list                                                                                                   |
| A paired hedge is only partially understood   | Both legs are shown in one confirmation and one instruction; the primary leg must fill before the second leg is sized from the actual fill | The external executor must submit the two non-atomic calls correctly, install protection, and stop/alert if either leg or protection fails |
| Flash volatility makes a proposal unsafe      | Flash-crash circuit breaker, drawdown guard, and strict timestamp expiry                                                                   | Market data can change after a scan before execution                                                                                       |
| A strategy loses repeatedly                   | Performance weighting and three-loss auto-pause                                                                                            | Resetting a strategy is a deliberate human action                                                                                          |
| Malformed scenario data reaches a strategy    | Strict Zod schemas, finite/positive numeric checks                                                                                         | Schema-valid data can still be economically poor                                                                                           |
| API input attempts command injection          | Next.js routes use a server-side child process with argument arrays, not shell strings                                                     | Keep the dashboard private because it has no authentication                                                                                |
| A process crashes while writing JSON          | Atomic temp-file replacement and cross-process file-level state locking                                                                    | JSON files are not a multi-process database or backup system                                                                               |
| Dashboard API is accessed by a malicious site | Hard localhost-only enforcement in the router and a strict cross-origin guard                                                              | Network must still be reasonably secure                                                                                                    |
| Secrets leak into a demo                      | Paper mode and offline fixtures                                                                                                            | A user can still choose to reveal private data while recording                                                                             |
| Demo data is mistaken for an account snapshot | Explicit `executionContext` labels, source validation, and blocked paper confirmation. Paper is the strict default.                        | The operator must still check the dashboard label before recording or confirming                                                           |

## Safe operating procedure

Before a live session:

1. Confirm the AI client is connected to the intended Binance Agentic
   sub-account, not a main account.
2. Grant only the MCP scopes required for the planned demonstration.
3. Keep the dashboard on localhost or behind an authenticated private network.
4. Use `DEMO / PAPER`, `MCP DATA / PAPER`, or a deliberately limited amount of
   risk capital. A funded MCP action must visibly say `MCP LIVE ACCOUNT` and
   `MCP LIVE` before it is eligible for confirmation.
5. Check the current profile, equity, drawdown, and pending-action count.
6. Run a scan and inspect the complete rationale before confirming anything.
7. Confirm one Action ID at a time; never confirm a copied or truncated ID.
8. After execution, verify the external tool result before logging the trade.

## Emergency stop

If anything looks wrong:

1. Do not confirm new actions.
2. Ask the orchestrating agent to stop making Binance write calls.
3. Use the dashboard's **Reject all** control only after reviewing that all
   pending actions should be rejected, or run:

   ```bash
   node dist/cli.js reject-all --json
   ```

4. Revoke or reduce the Agent OS permissions in Binance if external execution
   must stop immediately.
5. Preserve `data/events.jsonl`, `data/pending_actions.json`, and the relevant
   MCP response for diagnosis.

`reject-all` prevents future execution through those pending IDs; it cannot
undo an order that has already been submitted to Binance.

## Data handling

Runtime files are local and intentionally excluded from the publish artifact:

- `data/memory.json`: goals, trades, performance, and equity curve.
- `data/pending_actions.json`: proposal summaries and approval statuses.
- `data/events.jsonl`: append-only audit events.
- `data/live_scenario.json`: last live input snapshot when used.
- `data/backtest_memory.json`: isolated backtest output.

Do not commit these files, API credentials, private balances, account IDs, or
unredacted tool responses. Use the bundled fixtures for public recordings.

## Reporting a vulnerability

Do not publish credentials or an exploit in a public issue. Follow the process
in the root [SECURITY.md](../SECURITY.md). For a suspected live-account issue,
first revoke the relevant Binance Agent OS permission and stop execution.

## Scope disclaimer

This is experimental hackathon software, not financial advice and not a
guarantee of security, profitability, fills, or availability. The external
Binance MCP and Skills permissions remain part of the user's security model.
