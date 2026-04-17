import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { AnalysisResult } from "@/lib/types";
import { deriveReportData, sanitiseAddressForFilename } from "@/lib/pdf/derive";
import { StayfulReport } from "@/lib/pdf/StayfulReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let result: AnalysisResult;
  try {
    result = (await request.json()) as AnalysisResult;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!result?.property?.address) {
    return NextResponse.json({ error: "Missing analysis data" }, { status: 400 });
  }

  try {
    const data = deriveReportData(result);
    const buffer = await renderToBuffer(<StayfulReport data={data} />);
    const filename = `Stayful_Property_Analysis_${sanitiseAddressForFilename(result.property.address)}.pdf`;
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("PDF generation failed", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
