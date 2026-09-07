import {
  createPendingAction,
  resolveAction,
  listAllActions,
  expirePendingActionsForContext,
} from "../../src/execution/confirmationGate";
import { buildExecutionInstruction } from "../../src/execution/executionRouter";
import { proposePayment } from "../../src/execution/x402Payment";
import { PATHS } from "../../src/config/paths";
import { SizedOpportunity } from "../../src/types";
const opp: SizedOpportunity = {
  strategy: "momentum",
  symbol: "BTCUSDT",
  venue: "spot",
  direction: "buy",
  confidence: 0.8,
  rationale: "test",
  approved: true,
  suggestedSizeUsd: 100,
  finalSizeUsd: 100,
  referencePriceUsd: 100,
  riskNotes: [],
};
test("new actions default to blocked paper mode", () => {
  expect(createPendingAction(opp).executionMode).toBe("paper");
});
test("router refuses expired confirmed instructions even when handed an old object", () => {
  const action = createPendingAction(opp, undefined, "live", "mcp_live");
  expect(() =>
    buildExecutionInstruction({ ...action, status: "confirmed", expiresAt: "2020-01-01T00:00:00Z" }),
  ).toThrow(/expired/);
});
test("context switches revoke confirmed approvals", () => {
  const action = createPendingAction(opp, undefined, "live", "mcp_live");
  resolveAction(action.id, "confirmed");
  expirePendingActionsForContext("demo");
  expect(listAllActions().find((a) => a.id === action.id)?.status).toBe("expired");
});
test("x402 offline examples cannot claim live wallet provenance", () => {
  const action = proposePayment(
    {
      signalDescription: "test",
      endpoint: "https://example.invalid/signal",
      currency: "USDC",
      amountUsd: 0.5,
      targetStrategy: "momentum",
    },
    PATHS.PENDING_ACTIONS,
  );
  expect(action.executionContext).toBe("demo");
  expect(() => resolveAction(action.id, "confirmed")).toThrow(/paper/);
});
