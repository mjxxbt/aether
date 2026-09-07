import { NextRequest, NextResponse } from "next/server";
import { cliResponse, readBody } from "../../../server/localApi";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (body instanceof NextResponse) return body;
    const allowContextSwitch =
      typeof body === "object" &&
      body !== null &&
      (body as { allowContextSwitch?: unknown }).allowContextSwitch === true;

    // Using --json flag ensures machine-readable output from the CLI
    const response = await cliResponse([
      "propose",
      ...(allowContextSwitch ? ["--allow-context-switch"] : []),
      ...(body.offline === true ? ["--offline"] : []),
    ]);

    if (response.status === 409) {
      const data = await response
        .clone()
        .json()
        .catch(() => null);
      if (data?.error?.includes("MCP_CONTEXT_SWITCH_REQUIRED")) {
        return NextResponse.json(
          {
            error: "A Binance MCP context is active. Confirm the explicit switch to a public DEMO / PAPER scan first.",
            code: "MCP_CONTEXT_SWITCH_REQUIRED",
          },
          { status: 409 },
        );
      }
    }

    return response;
  } catch (err) {
    console.error("Scan failed:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
