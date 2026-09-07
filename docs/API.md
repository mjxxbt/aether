# Local API Reference

The Next.js dashboard exposes a small local API over the same origin. These
routes read or update the Aether JSON state; they do not directly call Binance.

> The dashboard has no authentication. Keep it on localhost or behind an
> authenticated private network.

## `GET /api/state`

Returns the current memory state and all pending-action records.

```json
{
  "memory": {},
  "pendingActions": []
}
```

The dashboard polls this endpoint every three seconds. The first request
initializes empty memory. All routes use the same CLI validation and serialized
state transactions. Mutations return `{success:true,result:<CLI JSON>}`.

## `POST /api/scan`

Send `{}` for a public scan or `{"offline":true}` for the bundled offline
fixture. Invalid JSON returns `400`. Runs the compiled CLI proposal flow with `--json`. The CLI may use the public
Binance ingestor when no scenario is supplied.

If the active state is `mcp_live`, the route returns `409
MCP_CONTEXT_SWITCH_REQUIRED` unless the caller explicitly sends
`{"allowContextSwitch":true}`. The dashboard asks for confirmation before
making that switch because it expires MCP approvals and replaces the active
context with `DEMO / PAPER`.

Successful response:

```json
{
  "success": true,
  "result": {
    "sized": [],
    "pendingActions": []
  }
}
```

This route may take longer than a normal state read because it waits for the
market-data and strategy pipeline.

## `POST /api/action`

Resolves one pending action. The ID must be copied exactly.

Request:

```json
{
  "id": "momentum-BTCUSDT-<timestamp>-<suffix>",
  "action": "confirm"
}
```

`action` must be either `confirm` or `reject`.

- `confirm` is accepted only for an action carrying both
  `executionMode:"live"` and `executionContext:"mcp_live"`; it changes the
  durable status and returns an execution instruction. Demo, paper, and legacy
  actions are blocked.
- `reject` changes the durable status without creating an instruction.
- malformed input returns `400`;
- an unknown ID returns `404`;
- expired, already-resolved, blocked, or busy actions return `409`;
- requests from a non-local host or foreign origin return `403`.

The route passes fixed CLI arguments to the compiled CLI through a server-side
child process; it does not construct a shell command from user input.

## `POST /api/clear-pending`

Rejects every currently pending action. It requires an explicit body:

```json
{
  "confirm": true
}
```

Any other body returns `400`. This preserves the action records and audit
history while changing their status to `rejected`.

## `POST /api/goals`

Stores a complete validated `RiskGoals` object:

```json
{
  "goals": {
    "profile": "balanced",
    "maxDrawdownPct": 0.08,
    "maxPositionPct": 0.15,
    "maxOnchainExposurePct": 0.05,
    "maxLeverage": 2,
    "minConfidence": 0.4,
    "reviewIntervalHours": 4,
    "onchainCooldownHours": 12
  }
}
```

The write is atomic. Updating goals affects future scans; it does not silently
rewrite pending actions.

## `POST /api/record-trade`

Records a validated outcome and recomputes strategy performance. Supply a stable
`trade.id` when retrying: identical retries are idempotent, conflicting records
return `409`. An open trade may transition to a closed outcome using the same
ID and unchanged entry fields.

Request:

```json
{
  "trade": {
    "strategy": "momentum",
    "symbol": "BTCUSDT",
    "direction": "buy",
    "venue": "spot",
    "sizeUsd": 100,
    "confidence": 0.62,
    "outcome": "win",
    "pnlUsd": 4.25,
    "notes": "Verified against external execution result"
  }
}
```

Use `outcome: "open"` only when the trade is genuinely open. Do not record a
win merely because a proposal was confirmed.

## `POST /api/reset-strategy`

Resets a paused or underperforming strategy through the shared `MemoryStore`
path. The request must identify a known strategy. Resetting removes that
strategy's recorded learning history and derived performance state; it does
not confirm or reject pending actions.

## CLI equivalents

For automation or debugging, use the compiled CLI:

```bash
node dist/cli.js pending --json
node dist/cli.js propose --json                         # DEMO / PAPER public scan
node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json --json  # MCP context
node dist/cli.js instruction --id '<confirmed-id>' --json
node dist/cli.js reject --id '<id>' --json
node dist/cli.js reject-all --json
node dist/cli.js report
```

See [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) for the safe sequence and
[GETTING_STARTED.md](GETTING_STARTED.md) for user-oriented setup.
