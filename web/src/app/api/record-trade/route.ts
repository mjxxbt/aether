import { NextRequest, NextResponse } from "next/server";
import { cliResponse, readBody } from "../../../server/localApi";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  return cliResponse(["record-trade", "--trade", JSON.stringify(body.trade ?? null)]);
}
