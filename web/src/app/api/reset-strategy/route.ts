import { NextRequest, NextResponse } from "next/server";
import { cliResponse, readBody } from "../../../server/localApi";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  if (typeof body.strategy !== "string") return NextResponse.json({ error: "Strategy is required" }, { status: 400 });
  return cliResponse(["reset-strategy", "--strategy", body.strategy]);
}
