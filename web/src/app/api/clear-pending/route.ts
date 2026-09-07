import { NextRequest, NextResponse } from "next/server";
import { cliResponse, readBody } from "../../../server/localApi";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  if (body.confirm !== true)
    return NextResponse.json(
      { error: "Explicit confirmation is required to reject all pending actions" },
      { status: 400 },
    );
  return cliResponse(["reject-all"]);
}
