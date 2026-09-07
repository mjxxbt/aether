# Contributing to Aether

This is a hackathon project. Contributions that keep the demo runnable
and the architecture intact are very welcome.

## Hard rules (do not break these)

1. **Trust boundary**: Nothing in the strategy, risk, memory, or execution
   modules may hold an API key or make a trading-write call. The optional
   ingestor may read public Binance market data, but all order, transfer,
   wallet, and payment actions are structured instructions for the
   orchestrating agent; they never execute in this repository.

2. **Confirm-before-execute**: Every new write-capable flow must route
   through `confirmationGate.ts`. No bypasses, no "fast path."

3. **TypeScript strict mode** and existing naming conventions.

4. **Offline-runnable**: `npm install && npm run build && npm start -- demo
--offline` must work with zero live credentials. Add a canned data path
   for any new feature that needs external data.

## Getting started

```bash
npm install
npm run build
npm start -- demo --offline  # offline sanity check
npm test             # all tests must pass before submitting a PR
```

## Adding a new strategy

1. Create `src/strategies/myStrategy.ts` following the pattern of
   `fundingRate.ts`. Export a `runMyStrategy(input, memory)` function
   that returns `Opportunity[]`.
2. Register it in `src/strategies/index.ts` `generateOpportunities`.
3. Add the new `StrategyId` to `types.ts` and `memory/store.ts`
   `ALL_STRATEGIES`.
4. Write unit tests in `tests/strategies/myStrategy.test.ts`.

## Pull request checklist

- [ ] `npm run build` passes with zero errors/warnings
- [ ] `npm test` passes
- [ ] New feature has canned data path (works offline)
- [ ] Trust boundary not broken (no trading-write client; public read ingestion is allowed)
- [ ] All new write-capable paths go through `confirmationGate.ts`
- [ ] User-facing behavior is documented in `docs/` and linked from the
      documentation map
- [ ] `docs/RELEASE_CHECKLIST.md` is still accurate
