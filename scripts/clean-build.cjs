const fs = require("node:fs");
const path = require("node:path");
// Only generated output inside this project is replaced.
const output = path.resolve(__dirname, "../dist");
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error("Refusing to clean a symlinked dist directory.");
}
fs.rmSync(output, { recursive: true, force: true });
