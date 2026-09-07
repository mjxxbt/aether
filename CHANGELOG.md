# Changelog

All notable changes to Aether are documented here. This project follows a
lightweight release format while it is in the hackathon phase.

## [0.2.0] — Hackathon release

### Added

- Five selectable risk profiles with dashboard and CLI support.
- Durable, visible, copyable Action IDs for every pending proposal.
- Pending-action deduplication and explicit reject-all cleanup.
- Silent initial pending-action synchronization and aggregated notifications.
- Offline demo mode and deterministic backtest fixtures.
- MACD warm-up validation and live ingestion candle-depth safeguards.
- Paired-leg delta-neutral funding proposals and execution instructions.
- Prediction-market, x402, sentiment, rebalance, and on-chain strategy paths.
- Atomic JSON persistence and strict Zod validation.
- Dashboard API error handling, action confirmation modal, and audit views.
- Hackathon submission, pitch, operations, FAQ, security, and release docs.

### Safety and limitations

- The local engine has no Binance credentials and no trading-write access.
- Confirmed actions become instructions; the orchestrating agent performs any
  external MCP or Skills call.
- The dashboard has no built-in authentication and must remain private.
- Backtests do not model fees, slippage, funding costs, or real fills.
- Zero-equity accounts use a $10,000 paper-mode baseline.
