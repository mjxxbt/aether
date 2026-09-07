import { NextRequest } from "next/server";
import { cliResponse, guardLocalRequest } from "../../../server/localApi";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  return guardLocalRequest(req) ?? cliResponse(["state"], true);
}
