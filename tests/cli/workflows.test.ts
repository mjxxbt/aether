import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
const root = resolve(__dirname, "../..");
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "aether-cli-test-"));
});
function cli(args: string[], expected = 0) {
  const result = spawnSync(process.execPath, [join(root, "dist/cli.js"), ...args, "--json"], {
    cwd: root,
    env: { ...process.env, AETHER_DATA_DIR: dataDir },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  expect(result.status).toBe(expected);
  return JSON.parse((expected ? result.stderr : result.stdout).trim().split("\n").at(-1)!);
}
function fixture() {
  const s = JSON.parse(readFileSync(join(root, "examples/demo-scenario.json"), "utf8"));
  s.portfolioSource = "binance_mcp";
  s.executionContext = "mcp_live";
  s.portfolioMode = "live";
  s.portfolio.timestamp = new Date().toISOString();
  s.portfolio.availableBalancesUsd = { spotUsd: 5000, marginUsd: 0, usdmFuturesUsd: 5000, coinmFuturesUsd: 0 };
  s.portfolio.spotAssetBalancesUsd = {};
  return s;
}
test("fresh state initializes and supports goals without a prior scan", () => {
  const goals = fixture().goals;
  expect(cli(["set-goals", "--goals", JSON.stringify(goals)]).ok).toBe(true);
  expect(cli(["state"]).memory.goals).toEqual(goals);
});
test("offline proposals are deduplicated and cannot be confirmed", () => {
  const first = cli(["propose", "--offline"]);
  const second = cli(["propose", "--offline"]);
  expect(first.pendingActions.length).toBeGreaterThan(0);
  expect(second.pendingActions.map((a: { id: string }) => a.id)).toEqual(
    first.pendingActions.map((a: { id: string }) => a.id),
  );
  expect(cli(["confirm", "--id", first.pendingActions[0].id], 1).error).toMatch(/paper|context|MCP-live/);
});
test("a drawdown halt revokes earlier approvals", () => {
  const s = fixture();
  const old = cli(["propose", "--scenario", JSON.stringify(s)]).pendingActions[0];
  s.portfolio.highWaterMarkUsd = s.portfolio.totalEquityUsd / 0.8;
  s.portfolio.currentDrawdownPct = 0.2;
  cli(["propose", "--scenario", JSON.stringify(s)]);
  expect(cli(["state"]).memory.riskHalt).toBeDefined();
  expect(cli(["confirm", "--id", old.id], 1).error).toMatch(/expired|STOP/);
});
test("confirmed instructions are retrieved without confirming twice and revoked on demo switch", () => {
  const action = cli(["propose", "--scenario", JSON.stringify(fixture())]).pendingActions[0];
  cli(["confirm", "--id", action.id]);
  expect(cli(["instruction", "--id", action.id]).instruction.route).toBe("binance_mcp");
  expect(cli(["confirm", "--id", action.id], 1).error).toMatch(/resolved/);
  cli(["score", "--offline"]);
  expect(cli(["instruction", "--id", action.id]).instruction).toBeDefined();
  expect(cli(["propose", "--offline"], 1).error).toMatch(/CONTEXT_SWITCH/);
  cli(["propose", "--offline", "--allow-context-switch"]);
  expect(cli(["instruction", "--id", action.id], 1).error).toMatch(/context|expired/);
});
test("duplicate trade retries do not pause a strategy or multiply PnL", () => {
  const trade = {
    id: "same-id",
    strategy: "momentum",
    symbol: "BTCUSDT",
    direction: "buy",
    venue: "spot",
    sizeUsd: 100,
    confidence: 0.5,
    outcome: "loss",
    pnlUsd: -10,
  };
  for (let i = 0; i < 3; i++) cli(["record-trade", "--trade", JSON.stringify(trade)]);
  const perf = cli(["report"]).performance.momentum;
  expect(perf.trades).toBe(1);
  expect(perf.totalPnlUsd).toBe(-10);
  expect(perf.paused).toBe(false);
  expect(cli(["record-trade", "--trade", JSON.stringify({ ...trade, pnlUsd: -20 })], 1).error).toMatch(
    /already exists/,
  );
});
test("saved halt goals also apply to the offline demo", () => {
  cli(["set-goals", "--goals", JSON.stringify({ ...fixture().goals, maxPositionPct: 0 })]);
  expect(cli(["propose", "--offline"]).pendingActions).toHaveLength(0);
});
