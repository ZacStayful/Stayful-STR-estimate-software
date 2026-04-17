import React from "react";
import { Document } from "@react-pdf/renderer";
import { PdfReportData } from "./derive";
import { Page1Overview } from "./pages/Page1Overview";
import { Page2Revenue } from "./pages/Page2Revenue";
import { Page3Comparables } from "./pages/Page3Comparables";
import { Page4LocalRisk } from "./pages/Page4LocalRisk";
import { Page5Growth } from "./pages/Page5Growth";

interface Props {
  data: PdfReportData;
}

export function StayfulReport({ data }: Props) {
  return (
    <Document
      title={`Stayful Property Analysis — ${data.property.address}`}
      author="Stayful"
      creator="Stayful"
      producer="Stayful"
    >
      <Page1Overview data={data} />
      <Page2Revenue data={data} />
      <Page3Comparables data={data} />
      <Page4LocalRisk data={data} />
      <Page5Growth data={data} />
    </Document>
  );
}
