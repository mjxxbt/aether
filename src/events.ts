import * as fs from "fs";
import * as path from "path";

export type EventType =
  | "opportunity_generated"
  | "opportunity_sized"
  | "action_proposed"
  | "action_confirmed"
  | "action_rejected"
  | "trade_recorded";

export interface AetherEvent {
  timestamp: string;
  type: EventType;
  data: Record<string, unknown>;
}

import { PATHS } from "./config/paths";
const DEFAULT_EVENT_LOG = PATHS.EVENTS_LOG;

export function logEvent(type: EventType, data: Record<string, unknown>, logPath: string = DEFAULT_EVENT_LOG): void {
  const event: AetherEvent = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(event) + "\n", "utf-8");
}

export function readEvents(logPath: string = DEFAULT_EVENT_LOG): AetherEvent[] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AetherEvent);
}
