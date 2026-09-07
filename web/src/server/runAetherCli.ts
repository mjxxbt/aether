import { spawn } from "node:child_process";
import * as path from "node:path";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the compiled Aether CLI from a dashboard route.
 *
 * This deliberately uses a child process instead of importing the CLI: the
 * CLI is an executable module and calls its dispatcher at import time. Using
 * spawn also keeps Next.js from treating the runtime CLI path as a bundled
 * server module during production builds.
 */
export function runAetherCli(args: string[]): Promise<CliResult> {
  const projectRoot = path.resolve(process.cwd(), "..");
  const cliPath = path.join(projectRoot, "dist", "cli.js");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        exitCode: 124,
        stdout,
        stderr: `${stderr}\nAether CLI timed out after 120 seconds.`,
      });
    }, 120_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export function parseLastJsonLine(output: string): unknown | undefined {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"));

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Ignore non-JSON log lines and continue looking for the CLI result.
    }
  }

  return undefined;
}

export function cliErrorMessage(result: CliResult): string {
  const parsed = parseLastJsonLine(result.stderr);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const error = (parsed as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return result.stderr.trim() || `Aether CLI exited with code ${result.exitCode}`;
}
