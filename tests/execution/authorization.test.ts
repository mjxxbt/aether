import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { assertActionContext, readExecutionInstruction } from "../../src/execution/authorization";
import { createPendingAction, resolveAction, listAllActions } from "../../src/execution/confirmationGate";
import { MemoryStore } from "../../src/memory/store";
import { MemoryState, PendingAction, SizedOpportunity, AccountContextStatus } from "../../src/types";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aether-auth-test-"));
}

const baseOpp: SizedOpportunity = {
  strategy: "momentum",
  symbol: "BTCUSDT",
  venue: "spot",
  direction: "buy",
  confidence: 0.8,
  rationale: "test",
  suggestedSizeUsd: 100,
  approved: true,
  finalSizeUsd: 100,
  referencePriceUsd: 50000,
  riskNotes: [],
};

function liveContext(overrides?: Partial<AccountContextStatus>): AccountContextStatus {
  return {
    source: "binance_mcp",
    mode: "live",
    executionContext: "mcp_live",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 10000,
    highWaterMarkUsd: 10000,
    currentDrawdownPct: 0,
    openPositions: 0,
    ...overrides,
  };
}

function memoryWithContext(overrides?: Partial<MemoryState>): MemoryState {
  return {
    trades: [],
    performance: {} as MemoryState["performance"],
    lastUpdated: new Date().toISOString(),
    accountContext: liveContext(),
    ...overrides,
  };
}

function liveAction(logPath?: string): PendingAction {
  return createPendingAction(baseOpp, logPath, "live", "mcp_live");
}

describe("assertActionContext", () => {
  it("passes for a live action with matching live context", () => {
    const action = liveAction();
    expect(() => assertActionContext(action, memoryWithContext())).not.toThrow();
  });

  it("throws when no account context exists", () => {
    const action = liveAction();
    expect(() => assertActionContext(action, memoryWithContext({ accountContext: undefined }))).toThrow(/context/i);
  });

  it("throws when account context is demo", () => {
    const action = liveAction();
    const memory = memoryWithContext({
      accountContext: liveContext({ executionContext: "demo", mode: "paper" }),
    });
    expect(() => assertActionContext(action, memory)).toThrow(/context/i);
  });

  it("throws when account snapshot has expired", () => {
    const action = liveAction();
    const memory = memoryWithContext({
      accountContext: liveContext({ capturedAt: "2020-01-01T00:00:00Z" }),
    });
    expect(() => assertActionContext(action, memory)).toThrow(/expired/i);
  });

  it("throws when riskHalt is active for a risk-adding action", () => {
    const action = liveAction();
    const memory = memoryWithContext({
      riskHalt: { reason: "EMERGENCY_STOP: test halt", timestamp: new Date().toISOString() },
    });
    expect(() => assertActionContext(action, memory)).toThrow(/EMERGENCY_STOP/);
  });

  it("allows risk-reducing spot sell during halt if held balance covers it", () => {
    const sellOpp: SizedOpportunity = {
      ...baseOpp,
      direction: "sell",
      venue: "spot",
    };
    const action = createPendingAction(sellOpp, undefined, "live", "mcp_live");
    const memory = memoryWithContext({
      riskHalt: { reason: "EMERGENCY_STOP: test halt", timestamp: new Date().toISOString() },
      accountContext: liveContext({ spotAssetBalancesUsd: { BTC: 500 } }),
    });
    expect(() => assertActionContext(action, memory)).not.toThrow();
  });

  it("blocks a spot sell during halt if held balance is insufficient", () => {
    const sellOpp: SizedOpportunity = {
      ...baseOpp,
      direction: "sell",
      venue: "spot",
      finalSizeUsd: 1000,
    };
    const action = createPendingAction(sellOpp, undefined, "live", "mcp_live");
    const memory = memoryWithContext({
      riskHalt: { reason: "EMERGENCY_STOP: test halt", timestamp: new Date().toISOString() },
      accountContext: liveContext({ spotAssetBalancesUsd: { BTC: 100 } }),
    });
    expect(() => assertActionContext(action, memory)).toThrow(/EMERGENCY_STOP/);
  });

  it("throws when goals have maxPositionPct === 0 (halted profile)", () => {
    const action = liveAction();
    const memory = memoryWithContext({
      goals: {
        profile: "halted",
        maxDrawdownPct: 0.1,
        maxPositionPct: 0,
        maxOnchainExposurePct: 0.05,
        maxLeverage: 1,
        minConfidence: 0.5,
        reviewIntervalHours: 4,
      },
    });
    expect(() => assertActionContext(action, memory)).toThrow(/halted/i);
  });

  it("passes for x402 payment when no halt is active", () => {
    const paymentOpp: SizedOpportunity = {
      ...baseOpp,
      finalSizeUsd: 0.5,
      raw: {
        type: "x402_payment",
        paymentContext: {
          source: "agent_os_wallet",
          executionMode: "live",
          capturedAt: new Date().toISOString(),
          walletAvailableUsd: 100,
        },
        endpoint: "https://example.invalid/signal",
        amountUsd: 0.5,
      },
    };
    const action = createPendingAction(paymentOpp, undefined, "live", "mcp_live");
    resolveAction(action.id, "confirmed");
    // x402 flow does not require accountContext, just no halt
    expect(() => assertActionContext(action, memoryWithContext({ accountContext: undefined }))).not.toThrow();
  });

  it("throws for x402 payment when halt is active", () => {
    const paymentOpp: SizedOpportunity = {
      ...baseOpp,
      finalSizeUsd: 0.5,
      raw: {
        type: "x402_payment",
        paymentContext: {
          source: "agent_os_wallet",
          executionMode: "live",
          capturedAt: new Date().toISOString(),
          walletAvailableUsd: 100,
        },
        endpoint: "https://example.invalid/signal",
        amountUsd: 0.5,
      },
    };
    const action = createPendingAction(paymentOpp, undefined, "live", "mcp_live");
    resolveAction(action.id, "confirmed");
    const memory = memoryWithContext({
      riskHalt: { reason: "EMERGENCY_STOP: test halt", timestamp: new Date().toISOString() },
    });
    expect(() => assertActionContext(action, memory)).toThrow(/EMERGENCY_STOP/);
  });
});

describe("readExecutionInstruction", () => {
  it("returns an instruction for a confirmed live action with valid context", () => {
    const dir = tempDir();
    const logPath = path.join(dir, "pending_actions.json");
    const memoryPath = path.join(dir, "memory.json");

    const action = createPendingAction(baseOpp, logPath, "live", "mcp_live");
    resolveAction(action.id, "confirmed", logPath);

    const store = new MemoryStore(memoryPath);
    const state = store.load();
    state.accountContext = liveContext();
    store.save(state);

    const instruction = readExecutionInstruction(action.id, logPath, memoryPath);
    expect(instruction.route).toBe("binance_mcp");
    expect(instruction.toolHint).toBeDefined();
  });

  it("throws for a non-existent action ID", () => {
    const dir = tempDir();
    const logPath = path.join(dir, "pending_actions.json");
    const memoryPath = path.join(dir, "memory.json");
    fs.writeFileSync(logPath, "[]");
    new MemoryStore(memoryPath).load(); // init

    expect(() => readExecutionInstruction("does-not-exist", logPath, memoryPath)).toThrow(/No pending action found/i);
  });

  it("throws for a pending (unconfirmed) action", () => {
    const dir = tempDir();
    const logPath = path.join(dir, "pending_actions.json");
    const memoryPath = path.join(dir, "memory.json");

    createPendingAction(baseOpp, logPath, "live", "mcp_live");

    const store = new MemoryStore(memoryPath);
    const state = store.load();
    state.accountContext = liveContext();
    store.save(state);

    const actions = listAllActions(logPath);
    // The action is pending, not confirmed — buildExecutionInstruction should reject
    expect(() => readExecutionInstruction(actions[0].id, logPath, memoryPath)).toThrow(/not 'confirmed'/i);
  });
});
