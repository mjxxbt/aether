# Binance Agent OS Integration

Aether is intentionally split across two cooperating surfaces:

1. `AGENT.md` is the Aether Orchestrator policy. It defines how the supported
   AI client gathers Binance context, invokes the deterministic engine, waits
   for the dashboard decision, and then calls the authorized Binance tool.
2. `src/` and `web/` are the credential-free control plane. They perform
   strategy scoring, risk sizing, memory, audit logging, and confirmation
   state, but they cannot access trading credentials or place orders.

The Binance MCP connection remains in the supported AI client by design. This
keeps Binance authentication, permission scopes, and the Agentic sub-account
inside the official Agent OS flow instead of duplicating them in this repo.
The local engine receives the resulting market/account context as validated
`StrategyInput` data and returns a deterministic proposal or execution
instruction.

## Execution coverage

Aether deliberately emits a small, auditable set of order workflows rather
than pretending to support every Binance order variant:

| Aether workflow                                | Primary action                                                                                                        | Protection / follow-up                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Spot buy, Spot exit, Margin buy/short          | `MARKET` with exchange-filtered base `quantity`; borrow-backed Margin shorts use the current `AUTO_BORROW_REPAY` enum | Spot/Margin protection is a separate post-fill OCO/conditional workflow using the actual fill           |
| USDⓈ-M or COIN-M entry                         | `MARKET` with venue-correct quantity units; COIN-M uses contracts                                                     | `STOP_MARKET`, `TAKE_PROFIT_MARKET`, and optional trailing algo orders after the entry is `FILLED`      |
| Large CEX entry                                | Several concrete market chunks                                                                                        | Each chunk is sent once; the full quantity is never repeated                                            |
| Delta-neutral funding hedge                    | Primary leg, then actual-fill-sized paired leg                                                                        | Non-atomic two-phase sequence; stop and alert on a failed leg or protection install                     |
| Spot→Futures transfer                          | Current MCP transfer tool resolved at runtime                                                                         | Source balance, destination wallet, permissions, and current schema are rechecked                       |
| Agentic Wallet prediction/on-chain/x402 action | Wallet-specific route                                                                                                 | Current market/payment requirements, balance, address, liquidity, slippage, and approvals are rechecked |

Arbitrary user-directed LIMIT, STOP, or other order types are not silently
invented by the engine. If a future strategy emits one, it must add a
venue-specific schema and tests before it can pass the execution gate.

## Live proof workflow

Use a supported client connected to the official Binance MCP Server, then
record the following sequence. Use the explicit `DEMO / PAPER`, `MCP DATA /
PAPER`, or deliberately limited `MCP LIVE ACCOUNT` state appropriate for the
demo; never blur them together.

### 1. Prove the Agent OS connection

Ask the client:

```text
Use the Binance MCP Server to show the current BTCUSDT price and 24-hour change.
Do not place an order.
```

The video should show the Binance MCP tool invocation and its live response.
This proves that the agent is connected to Agent OS rather than merely using
the public REST ingestor.

### 2. Run the Aether control loop

Ask the same client:

```text
Read AGENT.md in this repository and act as the Aether Orchestrator.
Fetch the Agentic sub-account balances and relevant market context through
Binance MCP, then run the Aether proposal flow. Show every risk rejection and
pending Action ID. Do not call a write-capable Binance tool yet.
```

The client should write only the sanitized `PortfolioSnapshot` to a temporary
file and pass it explicitly to:

```bash
node dist/cli.js propose --portfolio /tmp/aether-mcp-portfolio.json
```

The snapshot must include aggregate `availableBalancesUsd` for Spot, Margin,
USDⓈ-M, and COIN-M, plus `spotAssetBalancesUsd` for the USD value of each Spot
base asset. Without the venue balances or the Spot asset map Aether refuses a
live handoff because it cannot safely route collateral-dependent orders or
prevent an unheld Spot SELL.

This explicit path records the source as `binance_mcp`, preserves the live or
paper-mode decision, sets `executionContext:"mcp_live"`, and lets the
dashboard show the account-context status. For prediction markets, on-chain
actions, and x402 payments, the same real Agent OS context is routed through
Agentic Wallet/Skills rather than a Binance account-order tool. Public,
offline, or scenarios without an explicit validated MCP source use
`executionContext:"demo"`.
The video should show the rationale, final size, risk notes, Action ID, and
the exact `MCP LIVE ACCOUNT`, `MCP DATA / PAPER`, or
`LIVE AGENT OS WALLET / SKILLS` status. Do not put raw account rows or
identifiers in the file.

### 3. Prove the confirmation boundary

Open the dashboard, inspect the Action ID, and click **CONFIRM** only when it
shows `MCP LIVE ACCOUNT` and `MCP LIVE`. If the account is zero/dust, show
`MCP DATA / PAPER` and the disabled confirmation control instead. For a funded
MCP action, show that the dashboard returns an execution instruction but does
not place the order.
Then tell the client:

```text
Action ID <exact-id> is confirmed in the Aether dashboard and shows MCP LIVE.
Read the returned execution instruction, verify the current market price and
order parameters using `node dist/cli.js instruction --id <exact-id> --json`,
show the final parameters, and wait for my explicit YES before any write. Report the external
result; do not claim a fill unless Binance confirms it.
```

The post-confirmation dialog also provides a generated **Next Codex / agent
command** containing the exact Action ID. Copy that command into the same
connected AI session. It explicitly says that the dashboard confirmation is
already recorded, so the agent must not run `aether confirm` a second time; it
must repeat read-only preflight, show final parameters, and wait for final write
authorization.

For a delta-neutral proposal, show both linked legs and explain that they are
approved together but submitted as two external calls, not an exchange-level
atomic transaction.

## What the repository proves without live credentials

- `AGENT.md` provides the orchestrator's analyst, risk, and executor policy.
- Zod schemas validate the context handed to the local engine.
- The risk manager calculates deterministic limits and sizing.
- The confirmation gate refuses execution instructions for unresolved actions.
- Every proposal carries both `executionMode` and `executionContext`; only a
  confirmed `live` action from the `mcp_live` context can produce a Binance
  execution instruction. Context changes expire pending and confirmed approvals. Every fresh proposal
  scan revokes prior confirmed instructions.
- The dashboard records the user decision, displays the exact instruction, and
  provides a copyable continuation command for the connected AI agent.
- The supported AI client is the only component that holds the live MCP
  session and can call a write-capable Binance tool.

The CLI validates structure, freshness, and explicit source declarations. It
trusts the local orchestrator to attest provenance; labels are not signatures
and do not defend against an operator who edits the local files.

This boundary keeps exchange credentials outside the project. Do
not commit MCP credentials, private balances, or unredacted tool responses.
