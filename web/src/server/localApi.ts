import { NextRequest, NextResponse } from "next/server";
import { cliErrorMessage, parseLastJsonLine, runAetherCli } from "./runAetherCli";

export function guardLocalRequest(req: NextRequest): NextResponse | undefined {
  const host = req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
    return NextResponse.json({ error: "Dashboard requests must use localhost" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (
    (origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  }
}

export async function cliResponse(args: string[], state = false) {
  try {
    const result = await runAetherCli([...args, "--json"]);
    if (result.exitCode !== 0) {
      const error = cliErrorMessage(result);
      const status = /no pending action found/i.test(error)
        ? 404
        : /expired|resolved|EMERGENCY_STOP|context|paper|provenance|busy|already exists/i.test(error)
          ? 409
          : /invalid|validation|Usage:|Missing|requires|must/i.test(error)
            ? 400
            : 500;
      return NextResponse.json({ error }, { status });
    }
    const parsed = parseLastJsonLine(result.stdout);
    if (parsed === undefined) return NextResponse.json({ error: "Engine returned no JSON result" }, { status: 500 });
    return NextResponse.json(state ? parsed : { success: true, result: parsed });
  } catch {
    return NextResponse.json(
      { error: "Engine unavailable. Build the engine before starting the dashboard." },
      { status: 500 },
    );
  }
}

export async function readBody(req: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  const denied = guardLocalRequest(req);
  if (denied) return denied;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }
}
