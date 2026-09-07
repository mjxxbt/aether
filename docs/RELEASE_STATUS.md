# Release Status

Last verified: 2026-09-07

## Automated checks

| Check | Status | Notes |
|---|---|---|
| Engine build (`npm run build`) | ✅ Pass | TypeScript compilation clean |
| Test suite (`npm test`) | ✅ Pass | 18 suites, 137 tests |
| Dashboard lint (`cd web && npm run lint`) | ✅ Pass | |
| Dashboard build (`cd web && npm run build`) | ✅ Pass | Static + dynamic routes |
| Dependency audit (engine) | ✅ Pass | 0 vulnerabilities |
| Dependency audit (dashboard) | ✅ Pass | 0 vulnerabilities |
| Offline demo (`npm start -- demo --offline`) | ✅ Pass | Deterministic proposals |
| Backtest (`npm run backtest -- --data examples/backtest-klines.json`) | ✅ Pass | Isolated memory |
| Proposal deduplication | ✅ Pass | Repeat scans reuse IDs |
| Batch budget reservation | ✅ Pass | Cannot exceed exposure ceiling |
| Confirmed-action expiry enforcement | ✅ Pass | Router refuses expired timestamps |
| Context-switch revokes confirmations | ✅ Pass | Fresh scans expire prior confirmed instructions |
| Emergency-stop halt blocks confirmation | ✅ Pass | `assertActionContext` enforces riskHalt |
| Risk-reducing exit bypass | ✅ Pass | Spot sell of held assets bypasses drawdown breaker |
| Duplicate trade idempotency | ✅ Pass | Same ID retries are safe; conflicting records rejected |
| Paper-mode default | ✅ Pass | New actions default to paper; cannot be promoted silently |
| Dashboard localhost enforcement | ✅ Pass | `--hostname 127.0.0.1` in dev and start |
| Cross-origin request guard | ✅ Pass | Non-localhost and cross-origin requests return 403 |
| State lock serialization | ✅ Pass | Exclusive lock for CLI + dashboard mutations |

## External requirements (not automatable)

| Requirement | Status |
|---|---|
| Public GitHub repository | ⬜ Pending — initialize git, push to GitHub |
| Demo video recording | ⬜ Pending — record offline demo and dashboard walkthrough |
| Submission metadata (team, contact) | ⬜ Pending — fill placeholders in `HACKATHON_SUBMISSION.md` |
| Social post (follow, repost, reply) | ⬜ Pending — per official announcement rules |
| Official survey | ⬜ Pending — complete after social submission |

## Known limitations

- Test coverage: ~65% statement coverage overall; `cli.ts`, `authorization.ts`,
  `sentiment.ts`, `convertYield.ts`, and `runBacktest.ts` have low direct unit
  coverage (CLI paths are exercised by integration tests in `workflows.test.ts`).
- No browser-level e2e tests. Dashboard is manually verified.
- Backtest does not model fees, slippage, or funding costs.
- MCP source labels are operator attestations, not cryptographic evidence.
- The dashboard has no authentication; keep it on localhost.
