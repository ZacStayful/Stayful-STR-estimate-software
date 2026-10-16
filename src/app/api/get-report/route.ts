// "Access your report" lookup for /report. The lookup itself, and why it is
// built the way it is, lives in lib/apis/report-lookup.ts.

import { NextRequest, NextResponse } from "next/server";
import { lookupReport } from "@/lib/apis/report-lookup";

export async function POST(req: NextRequest) {
  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, body } = await lookupReport(email);
  return NextResponse.json(body, { status });
}
