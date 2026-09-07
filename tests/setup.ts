import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
process.env.AETHER_DATA_DIR = mkdtempSync(join(tmpdir(), "aether-test-state-"));
