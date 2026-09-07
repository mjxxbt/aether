import * as fs from "fs";
import * as path from "path";
import { DATA_DIR } from "./paths";

let depth = 0;
/** Serialize short, synchronous state transactions across CLI and dashboard. */
export function withStateLock<T>(operation: () => T): T {
  if (depth > 0) return operation();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lock = path.join(DATA_DIR, "state.lock");
  let fd: number;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Aether state is busy. Retry after the current operation finishes. If a process crashed, stop all Aether processes before removing data/state.lock.",
      );
    }
    throw error;
  }
  depth++;
  try {
    fs.writeFileSync(fd, String(process.pid));
    return operation();
  } finally {
    depth--;
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
