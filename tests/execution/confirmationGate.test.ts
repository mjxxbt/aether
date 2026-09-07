import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import {
  ACTION_TTL_MS,
  createPendingAction,
  expirePendingActionsForContext,
  expirePendingActionsForMode,
  rejectAllPendingActions,
  resolveAction,
  listPendingActions,
  listAllActions,
} from "../../src/execution/confirmationGate";
import { buildExecutionInstruction } from "../../src/execution/executionRouter";
import { SizedOpportunity } from "../../src/types";

function tempLogPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-gate-test-"));
  return path.join(tmpDir, "pending.json");
}

function makeApprovedOpp(overrides: Partial<SizedOpportunity> = {}): SizedOpportunity {
  return {
    strategy: "momentum",
    symbol: "BTCUSDT",
    direction: "long",
    venue: "spot",
    confidence: 0.75,
    rationale: "Test",
    suggestedSizeUsd: 1000,
    approved: true,
    finalSizeUsd: 1000,
    riskNotes: [],
    referencePriceUsd: 100,
    ...overrides,
  };
}

describe("confirmationGate — createLiveAction", () => {
  it("throws when trying to create action for unapproved opportunity", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({ approved: false, finalSizeUsd: 0, rejectionReason: "test" });
    expect(() => createLiveAction(opp, logPath)).toThrow(/not approve/i);
  });

  it("refuses observation-only hold signals even if a caller marks them approved", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({ direction: "hold" });
    expect(() => createLiveAction(opp, logPath)).toThrow(/observation-only/i);
  });

  it("creates a pending action with status 'pending'", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    expect(action.status).toBe("pending");
    expect(action.id).toBeTruthy();
    expect(action.summary).toContain("PROPOSED ACTION");
    expect(action.executionMode).toBe("live");
    expect(action.executionContext).toBe("mcp_live");
    expect(action.summary).toContain("BINANCE MCP ACCOUNT");
  });

  it("marks paper actions as demo and never treats them as live", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath, "paper");
    expect(action.executionMode).toBe("paper");
    expect(action.executionContext).toBe("demo");
    expect(action.summary).toContain("DEMO / PUBLIC / SCENARIO");
    expect(action.summary).toContain("no live write is permitted");
    expect(() => resolveAction(action.id, "confirmed", logPath)).toThrow(/demo\/paper|cannot be confirmed/i);
  });

  it("rejects an inconsistent live/demo action at creation time", () => {
    expect(() => createLiveAction(makeApprovedOpp(), tempLogPath(), "live", "demo")).toThrow(
      /without a Binance MCP account context/i,
    );
  });

  it("forces demo signal adapters into paper-only actions", () => {
    const opp = makeApprovedOpp({ signalContext: "demo" });
    expect(() => createLiveAction(opp, tempLogPath(), "live", "mcp_live")).toThrow(/demo signal adapter/i);

    const action = createLiveAction(opp, tempLogPath(), "paper", "mcp_live");
    expect(action.summary).toContain("MCP ACCOUNT / DEMO SIGNAL");
    expect(action.summary).toContain("DEMO ADAPTER — paper-only");
  });

  it("includes both legs in summary when pairedLeg is present", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({
      strategy: "funding_rate_neutral",
      venue: "usdm_futures",
      pairedLeg: {
        symbol: "BTCUSDT",
        direction: "buy",
        venue: "spot",
        sizeUsd: 1000,
        rationale: "Spot hedge leg",
      },
    });
    const action = createLiveAction(opp, logPath);
    expect(action.summary).toContain("Hedge leg");
    expect(action.summary).toContain("not exchange-atomic");
  });

  it("persists action to disk", () => {
    const logPath = tempLogPath();
    createLiveAction(makeApprovedOpp(), logPath);
    const raw = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(1);
  });

  it("does not create duplicate pending approvals for a repeated scan", () => {
    const logPath = tempLogPath();
    const first = createLiveAction(makeApprovedOpp(), logPath);
    const second = createLiveAction(makeApprovedOpp(), logPath);

    expect(second.id).toBe(first.id);
    expect(JSON.parse(fs.readFileSync(logPath, "utf-8"))).toHaveLength(1);
  });

  it("expires the previous approval when the same signal changes price or size", () => {
    const logPath = tempLogPath();
    const first = createLiveAction(makeApprovedOpp({ finalSizeUsd: 1000, referencePriceUsd: 100 }), logPath);
    const second = createLiveAction(makeApprovedOpp({ finalSizeUsd: 900, referencePriceUsd: 101 }), logPath);
    expect(second.id).not.toBe(first.id);
    const all = listAllActions(logPath);
    expect(all.find((action) => action.id === first.id)?.status).toBe("expired");
    expect(all.find((action) => action.id === second.id)?.status).toBe("pending");
  });
});

describe("confirmationGate — resolveAction", () => {
  it("marks action as confirmed", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    const resolved = resolveAction(action.id, "confirmed", logPath);
    expect(resolved.status).toBe("confirmed");
  });

  it("marks action as rejected", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    const resolved = resolveAction(action.id, "rejected", logPath);
    expect(resolved.status).toBe("rejected");
  });

  it("throws when action id not found", () => {
    const logPath = tempLogPath();
    expect(() => resolveAction("nonexistent-id", "confirmed", logPath)).toThrow(/no pending action found/i);
  });

  it("throws when trying to re-resolve an already resolved action", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    resolveAction(action.id, "confirmed", logPath);
    expect(() => resolveAction(action.id, "rejected", logPath)).toThrow(/already resolved/i);
  });
});

describe("confirmationGate — listPendingActions", () => {
  it("only returns actions with pending status", () => {
    const logPath = tempLogPath();
    const a1 = createLiveAction(makeApprovedOpp(), logPath);
    const a2 = createLiveAction(makeApprovedOpp({ symbol: "ETHUSDT" }), logPath);
    resolveAction(a1.id, "confirmed", logPath);
    const pending = listPendingActions(logPath);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(a2.id);
  });

  it("rejects all pending actions while preserving the audit log", () => {
    const logPath = tempLogPath();
    const first = createLiveAction(makeApprovedOpp(), logPath);
    const second = createLiveAction(makeApprovedOpp({ symbol: "ETHUSDT" }), logPath);
    resolveAction(first.id, "confirmed", logPath);

    const rejected = rejectAllPendingActions(logPath);
    expect(rejected.map((action) => action.id)).toEqual([second.id]);
    expect(listPendingActions(logPath)).toHaveLength(0);
    const raw = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    expect(raw).toHaveLength(2);
    expect(raw.find((action: { id: string }) => action.id === second.id).status).toBe("rejected");
  });

  it("expires stale pending approvals and refuses to resolve them", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    const raw = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    raw[0].createdAt = new Date(Date.now() - ACTION_TTL_MS - 1000).toISOString();
    raw[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(logPath, JSON.stringify(raw));

    expect(listPendingActions(logPath)).toHaveLength(0);
    expect(listAllActions(logPath)[0].status).toBe("expired");
    expect(() => resolveAction(action.id, "confirmed", logPath)).toThrow(/already resolved|expired/i);
  });

  it("fails closed for legacy actions without an execution mode", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    const raw = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    delete raw[0].executionMode;
    fs.writeFileSync(logPath, JSON.stringify(raw));
    const migrated = listAllActions(logPath)[0];
    expect(migrated.executionMode).toBe("paper");
    expect(() => buildExecutionInstruction({ ...migrated, status: "confirmed" })).toThrow(/paper|legacy/i);
  });

  it("expires pending approvals when the account switches execution mode", () => {
    const logPath = tempLogPath();
    const live = createLiveAction(makeApprovedOpp({ symbol: "BTCUSDT" }), logPath, "live");
    const paper = createLiveAction(makeApprovedOpp({ symbol: "ETHUSDT" }), logPath, "paper");

    const expired = expirePendingActionsForMode("paper", logPath);

    expect(expired.map((action) => action.id)).toEqual([live.id]);
    expect(listAllActions(logPath).find((action) => action.id === live.id)?.status).toBe("expired");
    expect(listAllActions(logPath).find((action) => action.id === paper.id)?.status).toBe("pending");
  });

  it("expires approvals when the data context changes even if both are paper", () => {
    const logPath = tempLogPath();
    const mcpPaper = createLiveAction(makeApprovedOpp({ symbol: "BTCUSDT" }), logPath, "paper", "mcp_live");
    const demo = createLiveAction(makeApprovedOpp({ symbol: "ETHUSDT" }), logPath, "paper", "demo");

    const expired = expirePendingActionsForContext("demo", logPath);

    expect(expired.map((action) => action.id)).toEqual([mcpPaper.id]);
    expect(listAllActions(logPath).find((action) => action.id === mcpPaper.id)?.status).toBe("expired");
    expect(listAllActions(logPath).find((action) => action.id === demo.id)?.status).toBe("pending");
  });
});

describe("executionRouter — buildExecutionInstruction", () => {
  it("throws for non-confirmed actions", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp(), logPath);
    // action is still 'pending'
    expect(() => buildExecutionInstruction(action)).toThrow(/not 'confirmed'/i);
  });

  it("routes spot to binance_mcp", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp({ venue: "spot" }), logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.route).toBe("binance_mcp");
    expect(instr.toolHint).toContain("spot");
  });

  it("rejects a confirmed action that claims live mode but has demo data", () => {
    const action = createLiveAction(makeApprovedOpp(), tempLogPath());
    expect(() =>
      buildExecutionInstruction({
        ...action,
        status: "confirmed",
        executionMode: "live",
        executionContext: "demo",
      }),
    ).toThrow(/MCP-live|Demo/i);
  });

  it("routes usdm_futures to binance_mcp with futures toolHint", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({ venue: "usdm_futures" });
    const action = createLiveAction(opp, logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.toolHint).toBe("futures_usds.newOrder");
    expect(instr.mcpToolCandidates).toEqual(["futures_usds.newOrder"]);
  });

  it("builds valid quantity units for COIN-M futures", () => {
    const action = createLiveAction(
      makeApprovedOpp({
        venue: "coinm_futures",
        symbol: "BTCUSD_PERP",
        finalSizeUsd: 1000,
        referencePriceUsd: 100,
        executionConstraints: {
          contractSize: 100,
          quantityStepSize: 1,
          minQuantity: 1,
          minNotionalUsd: 5,
        },
      }),
      tempLogPath(),
    );
    const instruction = buildExecutionInstruction({ ...action, status: "confirmed" });
    expect(instruction.args).toMatchObject({
      symbol: "BTCUSD_PERP",
      side: "BUY",
      type: "MARKET",
      quantity: 10,
      newOrderRespType: "RESULT",
    });
  });

  it("routes a margin short with explicit auto-borrow semantics", () => {
    const action = createLiveAction(
      makeApprovedOpp({
        venue: "margin",
        direction: "short",
        executionConstraints: { quantityStepSize: 0.001, minNotionalUsd: 5 },
      }),
      tempLogPath(),
    );
    const instruction = buildExecutionInstruction({ ...action, status: "confirmed" });
    expect(instruction.args).toMatchObject({ side: "SELL", sideEffectType: "AUTO_BORROW_REPAY" });
  });

  it("routes onchain to agentic_wallet", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({
      venue: "onchain",
      direction: "buy",
      raw: { chain: "bsc", address: "0xabc" },
    });
    const action = createLiveAction(opp, logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.route).toBe("agentic_wallet");
    expect(instr.toolHint).toContain("swap");
  });

  it("includes pairedLegInstruction for delta-neutral opportunities", () => {
    const logPath = tempLogPath();
    const opp = makeApprovedOpp({
      strategy: "funding_rate_neutral",
      venue: "usdm_futures",
      pairedLeg: {
        symbol: "BTCUSDT",
        direction: "buy",
        venue: "spot",
        sizeUsd: 1000,
        rationale: "Hedge",
      },
    });
    const action = createLiveAction(opp, logPath);
    resolveAction(action.id, "confirmed", logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.pairedLegInstruction).toBeDefined();
    expect(instr.pairedLegInstruction!.route).toBe("binance_mcp");
  });

  it("keeps large CEX orders valid and exposes chunking as a separate plan", () => {
    const logPath = tempLogPath();
    const action = createLiveAction(makeApprovedOpp({ finalSizeUsd: 2000, suggestedSizeUsd: 2000 }), logPath);
    const confirmed = { ...action, status: "confirmed" as const };
    const instr = buildExecutionInstruction(confirmed);
    expect(instr.args.type).toBe("MARKET");
    expect(instr.args.quantity).toBe(5);
    expect(instr.executionPlan).toMatchObject({
      kind: "split_market",
      chunks: 4,
      intervalSeconds: 225,
      totalQuantity: 20,
      perChunkQuantity: 5,
      chunkQuantities: [5, 5, 5, 5],
    });
  });

  it("uses quantity-based MCP args and exposes a direction-aware protection plan", () => {
    const action = createLiveAction(
      makeApprovedOpp({
        referencePriceUsd: 100,
        finalSizeUsd: 1000,
        stopPricePct: 0.05,
        takeProfitPct: 0.15,
        trailingStopPct: 0.025,
      }),
    );
    const instr = buildExecutionInstruction({ ...action, status: "confirmed" });

    expect(instr.args).toMatchObject({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: 10 });
    expect(instr.args).not.toHaveProperty("quoteOrderQtyUsd");
    expect(instr.protectionPlan).toMatchObject({
      mode: "post_fill_conditional",
      referencePriceUsd: 100,
      stopLossPriceUsd: 95,
      takeProfitPriceUsd: 115,
    });
  });

  it("uses algo-order payloads for futures protection and requires the actual fill for trailing", () => {
    const action = createLiveAction(
      makeApprovedOpp({
        venue: "usdm_futures",
        referencePriceUsd: 100,
        executionConstraints: { quantityStepSize: 0.001, priceTickSize: 0.1 },
        stopPricePct: 0.05,
        takeProfitPct: 0.15,
        trailingStopPct: 0.025,
      }),
    );
    const instr = buildExecutionInstruction({ ...action, status: "confirmed" });
    expect(instr.protectionPlan?.stopLossOrder).toMatchObject({
      tool: "futures_usds.newAlgoOrder",
      apiEndpoint: "/fapi/v1/algoOrder",
      algoType: "CONDITIONAL",
      type: "STOP_MARKET",
      triggerPrice: 95,
      closePosition: true,
    });
    expect(instr.protectionPlan?.stopLossOrder).not.toHaveProperty("stopPrice");
    expect(instr.protectionPlan?.trailingStopOrder).toMatchObject({
      type: "TRAILING_STOP_MARKET",
      callbackRate: 2.5,
      quantitySource: "actual_primary_fill",
      requiresActualFilledQuantity: true,
    });
    expect(instr.protectionPlan?.requiresFuturesPositionSideResolution).toBe(true);
    expect(instr.preflight?.readOnlyChecks.join(" ")).toMatch(/Hedge Mode.*positionSide/i);
  });

  it("refuses paper-mode actions before creating any live route", () => {
    const action = createLiveAction(makeApprovedOpp(), tempLogPath(), "paper");
    expect(() => buildExecutionInstruction({ ...action, status: "confirmed" })).toThrow(/paper/i);
  });
});

// Routing fixtures opt into live mode explicitly; production defaults remain paper.
function createLiveAction(
  opp: Parameters<typeof createPendingAction>[0],
  logPath?: string,
  mode: "live" | "paper" = "live",
  context: "mcp_live" | "demo" = mode === "live" ? "mcp_live" : "demo",
) {
  return createPendingAction(opp, logPath, mode, context);
}
