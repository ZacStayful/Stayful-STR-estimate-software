import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { AnalysisResult } from "@/lib/types";
import { deriveReportData, sanitiseAddressForFilename } from "@/lib/pdf/derive";
import { StayfulReport } from "@/lib/pdf/StayfulReport";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let result: AnalysisResult;
  try {
    result = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!result?.property?.address || !result?.financials) {
    return new Response("Missing required analysis data", { status: 400 });
  }

  const data = deriveReportData(result);
  const buffer = await renderToBuffer(<StayfulReport data={data} />);

  const filename = `Stayful_Property_Analysis_${sanitiseAddressForFilename(result.property.address)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
