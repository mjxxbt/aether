import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { MemoryStore } from "../../src/memory/store";
import { TradeRecord } from "../../src/types";

function tempStore(): MemoryStore {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-test-"));
  return new MemoryStore(path.join(tmpDir, "memory.json"));
}

function makeTrade(strategy: TradeRecord["strategy"], outcome: TradeRecord["outcome"], pnl = 0): TradeRecord {
  return {
    id: `${strategy}-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    strategy,
    symbol: "BTCUSDT",
    direction: "long",
    venue: "spot",
    sizeUsd: 1000,
    confidence: 0.7,
    outcome,
    pnlUsd: pnl,
  };
}

describe("MemoryStore — weight math", () => {
  it("starts every strategy at weight 1.0", () => {
    const store = tempStore();
    const state = store.load();
    expect(state.performance["momentum"].weight).toBe(1);
    expect(state.performance["funding_rate"].weight).toBe(1);
  });

  it("increases weight on a win (+0.05)", () => {
    const store = tempStore();
    store.recordTrade(makeTrade("momentum", "win", 50));
    const state = store.recomputePerformance();
    expect(state.performance["momentum"].weight).toBeCloseTo(1.05, 5);
  });

  it("decreases weight on a loss (-0.08)", () => {
    const store = tempStore();
    store.recordTrade(makeTrade("momentum", "loss", -50));
    const state = store.recomputePerformance();
    expect(state.performance["momentum"].weight).toBeCloseTo(0.92, 5);
  });

  it("clamps weight to [0.1, 1.5]", () => {
    const store = tempStore();
    // 10 wins: 1 + 10*0.05 = 1.5 (hits upper bound)
    for (let i = 0; i < 10; i++) {
      store.recordTrade(makeTrade("momentum", "win", 100));
    }
    const state = store.recomputePerformance();
    expect(state.performance["momentum"].weight).toBe(1.5);
  });

  it("clamps weight to minimum 0.1 after many losses (before auto-pause)", () => {
    const store = tempStore();
    // 2 losses: 1 - 2*0.08 = 0.84, well above 0.1
    for (let i = 0; i < 2; i++) {
      store.recordTrade(makeTrade("momentum", "loss", -100));
    }
    const state = store.recomputePerformance();
    expect(state.performance["momentum"].weight).toBeGreaterThanOrEqual(0.1);
  });
});

describe("MemoryStore — 3-consecutive-loss auto-pause", () => {
  it("pauses after exactly 3 consecutive losses", () => {
    const store = tempStore();
    for (let i = 0; i < 3; i++) {
      store.recordTrade(makeTrade("funding_rate", "loss", -100));
    }
    const state = store.recomputePerformance();
    expect(state.performance["funding_rate"].paused).toBe(true);
    expect(state.performance["funding_rate"].weight).toBe(0);
  });

  it("does NOT pause after only 2 consecutive losses", () => {
    const store = tempStore();
    for (let i = 0; i < 2; i++) {
      store.recordTrade(makeTrade("funding_rate", "loss", -100));
    }
    const state = store.recomputePerformance();
    expect(state.performance["funding_rate"].paused).toBe(false);
  });

  it("resets streak counter on a win between losses", () => {
    const store = tempStore();
    store.recordTrade(makeTrade("funding_rate", "loss", -100));
    store.recordTrade(makeTrade("funding_rate", "loss", -100));
    store.recordTrade(makeTrade("funding_rate", "win", 50)); // streak resets
    store.recordTrade(makeTrade("funding_rate", "loss", -100));
    const state = store.recomputePerformance();
    // Only 1 consecutive loss at end, not 3 → not paused
    expect(state.performance["funding_rate"].paused).toBe(false);
  });
});

describe("MemoryStore — resetStrategy", () => {
  it("clears paused state and resets to weight 1.0", () => {
    const store = tempStore();
    for (let i = 0; i < 3; i++) {
      store.recordTrade(makeTrade("momentum", "loss", -100));
    }
    store.recomputePerformance();
    const afterReset = store.resetStrategy("momentum");
    expect(afterReset.performance["momentum"].paused).toBe(false);
    expect(afterReset.performance["momentum"].weight).toBe(1);
    expect(afterReset.performance["momentum"].trades).toBe(0);
    expect(afterReset.trades.some((trade) => trade.strategy === "momentum")).toBe(false);
  });
});

describe("MemoryStore — per-symbol breakdown", () => {
  it("tracks wins/losses per symbol", () => {
    const store = tempStore();
    store.recordTrade({ ...makeTrade("momentum", "win", 50), symbol: "BTCUSDT" });
    store.recordTrade({ ...makeTrade("momentum", "loss", -30), symbol: "BTCUSDT" });
    store.recordTrade({ ...makeTrade("momentum", "win", 20), symbol: "ETHUSDT" });
    const state = store.recomputePerformance();
    const bySymbol = state.performance["momentum"].bySymbol!;
    expect(bySymbol["BTCUSDT"].trades).toBe(2);
    expect(bySymbol["BTCUSDT"].wins).toBe(1);
    expect(bySymbol["BTCUSDT"].losses).toBe(1);
    expect(bySymbol["ETHUSDT"].trades).toBe(1);
  });
});

describe("MemoryStore — equity curve", () => {
  it("appends a point on each appendEquityCurve call", () => {
    const store = tempStore();
    const portfolio = {
      timestamp: new Date().toISOString(),
      totalEquityUsd: 10_500,
      highWaterMarkUsd: 11_000,
      currentDrawdownPct: 0.045,
      positions: [],
    };
    store.appendEquityCurve(portfolio);
    store.appendEquityCurve({ ...portfolio, totalEquityUsd: 10_800 });
    const state = store.load();
    expect(state.equityCurve!.length).toBe(2);
    expect(state.equityCurve![0].totalEquityUsd).toBe(10_500);
    expect(state.equityCurve![1].totalEquityUsd).toBe(10_800);
  });

  it("persists sanitized account-context provenance", () => {
    const store = tempStore();
    store.recordAccountContext({
      source: "binance_mcp",
      mode: "live",
      executionContext: "mcp_live",
      capturedAt: "2026-09-06T00:00:00.000Z",
      totalEquityUsd: 25000,
      highWaterMarkUsd: 26000,
      currentDrawdownPct: 0.03846,
      openPositions: 0,
    });

    expect(store.load().accountContext).toEqual({
      source: "binance_mcp",
      mode: "live",
      executionContext: "mcp_live",
      capturedAt: "2026-09-06T00:00:00.000Z",
      totalEquityUsd: 25000,
      highWaterMarkUsd: 26000,
      currentDrawdownPct: 0.03846,
      openPositions: 0,
    });
  });

  it("migrates an old non-MCP account context to demo/paper", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-context-migration-"));
    const filePath = path.join(tmpDir, "memory.json");
    const store = new MemoryStore(filePath);
    const initial = store.load();
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        ...initial,
        accountContext: {
          source: "public_rest",
          mode: "live",
          capturedAt: "2026-09-06T00:00:00.000Z",
          totalEquityUsd: 10_000,
          highWaterMarkUsd: 10_000,
          currentDrawdownPct: 0,
          openPositions: 0,
        },
      }),
    );

    const migrated = new MemoryStore(filePath).load();

    expect(migrated.accountContext?.executionContext).toBe("demo");
    expect(migrated.accountContext?.mode).toBe("paper");
    expect(JSON.parse(fs.readFileSync(filePath, "utf8")).accountContext).toMatchObject({
      executionContext: "demo",
      mode: "paper",
    });
  });
});
