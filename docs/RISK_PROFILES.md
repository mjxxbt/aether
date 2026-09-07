# Risk Profiles

Aether provides five risk presets. A profile controls what the engine may
approve; it does not guarantee returns and it never executes anything itself.

| Profile              | Max drawdown | Max position | Max leverage | Min confidence | On-chain exposure |
| -------------------- | -----------: | -----------: | -----------: | -------------: | ----------------: |
| Capital Preservation |           2% |           5% |           1x |            70% |                0% |
| Conservative         |           5% |          10% |           1x |            55% |                0% |
| Balanced             |           8% |          15% |           2x |            40% |                5% |
| Growth               |          12% |          20% |           3x |            30% |               10% |
| Aggressive           |          20% |          30% |           5x |            25% |               20% |

These are guardrails, not recommendations. Choose the profile that matches
your own risk tolerance and use only risk capital.

## Selecting a profile

In the dashboard, open **Risk Profile**, read the description and limits,
select a preset, then click **Apply Profile**.

From the CLI, use the equivalent goals explicitly:

```bash
node dist/cli.js set-goals --goals '{
  "profile":"balanced",
  "maxDrawdownPct":0.08,
  "maxPositionPct":0.15,
  "maxOnchainExposurePct":0.05,
  "maxLeverage":2,
  "minConfidence":0.4,
  "reviewIntervalHours":4,
  "onchainCooldownHours":12
}'
```

Changing a profile affects future scans. It does not rewrite or silently
approve existing pending actions. Review existing actions against the new
profile or use **Reject all** before scanning again. Repeating a scan for an
already-pending opportunity reuses its existing action ID instead of creating
another duplicate approval.

## What the limits mean

- **Maximum drawdown** blocks new risk-taking after the drawdown limit.
- **Maximum position** caps each opportunity as a percentage of equity.
- **Maximum leverage** limits aggregate exposure and futures leverage.
- **Minimum confidence** filters weak strategy signals.
- **On-chain exposure** caps total on-chain allocation.

If the connected MCP account reports zero equity and no positions, Aether
preserves the `mcp_live` data provenance but uses `MCP DATA / PAPER` with a
$10,000 baseline. Public, offline, and non-MCP scenario inputs use
`DEMO / PAPER`.
Both paper states create proposals for demonstration only; neither can place
real orders.
