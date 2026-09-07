import { NextRequest, NextResponse } from "next/server";
import { cliResponse, readBody } from "../../../server/localApi";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const { id, action } = body;
  if (typeof id !== "string" || !id.trim() || id.length > 200 || (action !== "confirm" && action !== "reject"))
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  return cliResponse([action, "--id", id]);
}
