# Testing

## Running the tests

```bash
npm install
npm test
```

For a completely offline smoke test of the CLI pipeline:

```bash
npm run build
npm start -- demo --offline
```

Jest + ts-jest compiles the TypeScript tests in `tests/` directly —
no separate build step needed for the test suite.

```bash
npm run test:watch   # interactive watch mode during development
```

## What's covered

| File                                          | Tests                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/strategies/fundingRate.test.ts`        | `scoreFunding` edge cases (band boundaries, clamping, symmetry), directional strategy direction, delta-neutral paired leg                                                                 |
| `tests/strategies/momentum.test.ts`           | 34-candle MACD signal floor, noise floor, long/short signal detection, configurable window, RSI down-weighting                                                                            |
| `tests/ingestor/binance.test.ts`              | Live-market ingestion requests enough candles for a complete MACD signal                                                                                                                  |
| `tests/strategies/onchainAlpha.test.ts`       | Audit gate, liquidity floor, tier 1/3 size multipliers, cooldown suppression and expiry                                                                                                   |
| `tests/strategies/portfolioRebalance.test.ts` | Multi-venue aggregation and safe symbol normalization                                                                                                                                     |
| `tests/strategies/predictionMarket.test.ts`   | Explicit YES/NO selection and Agentic Wallet routing                                                                                                                                      |
| `tests/risk/riskManager.test.ts`              | Drawdown breaker at/below limit, position clamping, on-chain cap, leverage ceiling, confidence floor, hold-signal rejection                                                               |
| `tests/backtest/buildScenarios.test.ts`       | Default historical lookback is long enough for momentum indicators                                                                                                                        |
| `tests/memory/store.test.ts`                  | Weight math (win +0.05 / loss -0.08 / clamp), 3-consecutive-loss auto-pause, `resetStrategy`, per-symbol breakdown, equity curve                                                          |
| `tests/execution/confirmationGate.test.ts`    | Refusal on unapproved opp, MCP-live/demo distinction, paired-leg summary, persistence, resolve/reject, idempotency guard, context/mode expiry                                             |
| `tests/execution/confirmationGate.test.ts`    | Refusal on unapproved opp, MCP-live/demo distinction, paired-leg summary, persistence, resolve/reject, idempotency guard, context/mode expiry                                             |
| `tests/execution/executionRouter.test.ts`     | `buildExecutionInstruction` refuses non-confirmed, demo, paper, and mismatched-context actions; correct `toolHint` for spot / futures / onchain; `pairedLegInstruction` for delta-neutral |
| `tests/cli/workflows.test.ts`                 | E2E CLI behavior: state initialization, deduplication, halt revocation, instruction retrieval, duplicate trade logging                                                                    |
| `tests/execution/expiry.test.ts`              | Expiry enforcement logic for pending/confirmed actions, context invalidation, x402 paper defaults                                                                                         |
| `tests/risk/batchBudget.test.ts`              | Shared budget sizing across multiple opportunities, on-chain exposure limit, held spot bypass                                                                                             |
| `tests/schemas/context.test.ts`               | MCP/paper normalization logic, dust/stale snapshot rejection, `PortfolioMode` handling                                                                                                    |

## Running the backtest

The backtest harness needs a JSON file of historical klines keyed by symbol:

```json
{
  "BTCUSDT": [
    { "openTime": "2026-01-01T00:00:00Z", "open": 42000, "high": 42500, "low": 41500, "close": 42300, "volume": 1200 },
    ...
  ],
  "ETHUSDT": [ ... ]
}
```

Then run:

```bash
npm run build
npm run backtest -- --data path/to/klines.json
# or with verbose trade-by-trade output:
node dist/cli.js backtest --data path/to/klines.json --verbose

# bundled fixture:
node dist/cli.js backtest --data examples/backtest-klines.json
```

The harness writes results to `data/backtest_memory.json` — the live
`data/memory.json` is **never modified**.

### Assumptions and limitations

- Fills at the closing price of the current candle (no slippage model).
- Trade "closed" at the next candle's close.
- Transaction fees and funding costs not modeled.
- Portfolio equity updated cumulatively (compounding).
- Designed to validate signal quality, not simulate real trading.
- The bundled fixture is a deterministic smoke test, not evidence of a
  profitable strategy; evaluate with independent historical data.

A production backtest would need fill simulation, fee modeling, and
realistic slippage. The strategy functions are stateless and
backtest-friendly by design — you can feed them any `StrategyInput`.
