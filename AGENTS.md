# Aether — Codex Quick Contract

This repository uses `AGENT.md` as the complete Aether Orchestrator policy.
Read it, plus `docs/AGENT_OS_INTEGRATION.md`, before operating the project.

The user can use these short commands after this file is loaded:

- **“Run Aether local checks.”** Run `npm run build`, `npm test -- --runInBand`,
  and report failures clearly.
- **“Run the paper demo.”** Run `npm start -- demo --offline`; never call a
  Binance write tool.
- **“Run a read-only Aether scan.”** Use only read-only Binance MCP/Skills
  tools, fetch market data plus account balances/positions, compute a sanitized
  portfolio snapshot (including `availableBalancesUsd` for Spot, Margin,
  USDⓈ-M, and COIN-M, plus `spotAssetBalancesUsd` for Spot base holdings), save
  it to a temporary JSON file, run `node dist/cli.js propose --portfolio
  <file>`, and stop at pending Action IDs. This path creates
  `executionContext:"mcp_live"`; public, offline, and scenarios without an
  explicit validated MCP source are `executionContext:"demo"`.
- **“Show my balance safely.”** Report only aggregate USD-equivalent equity,
  funded wallet categories, and non-zero position count. Never expose raw asset
  quantities, account aliases, IDs, or private responses.
- **“Open the Aether dashboard.”** Run `npm run dashboard` and direct the user
  to `http://localhost:3000`.
- **“I confirmed Action ID <id>.”** Verify that exact ID is a pending real
  Agent OS action (`MCP LIVE ACCOUNT` for CEX account flows or `LIVE AGENT OS
  WALLET / SKILLS` for wallet flows) in `data/pending_actions.json`, read the
  generated instruction, re-check current price/account state, resolve its
  semantic tool hint against the tools currently exposed by MCP/Skills, and
  ask for one final parameter review before any write-capable call. Demo,
  paper, and legacy IDs must be rejected or replaced with a fresh scan.
- **“Reject all pending actions.”** Run the explicit bulk-rejection workflow.

Never call an order, transfer, cancel, swap, or payment tool merely because a
scan produced a proposal. A write-capable Binance or Wallet tool is allowed
only after the user confirms the exact Action ID in the dashboard. The local
engine never places orders; it creates auditable instructions for the connected
AI client.

When a real MCP account has zero or only dust, say **MCP DATA / PAPER** and use
Aether's $10,000 paper baseline. Public, offline, and non-MCP scenario data
must say **DEMO / PAPER**. Do not invent balances. Never claim a fill without
a confirmed external response. Keep the local dashboard on localhost.
