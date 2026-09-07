import * as path from "path";

export const DATA_DIR = process.env.AETHER_DATA_DIR
  ? path.resolve(process.env.AETHER_DATA_DIR)
  : path.resolve(process.cwd(), process.cwd().endsWith("web") ? "../data" : "data");

export const PATHS = {
  MEMORY: path.join(DATA_DIR, "memory.json"),
  PENDING_ACTIONS: path.join(DATA_DIR, "pending_actions.json"),
  EVENTS_LOG: path.join(DATA_DIR, "events.jsonl"),
  LIVE_SCENARIO: path.join(DATA_DIR, "live_scenario.json"),
  BACKTEST_MEMORY: path.join(DATA_DIR, "backtest_memory.json"),
};
