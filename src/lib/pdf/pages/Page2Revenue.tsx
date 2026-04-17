import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS } from "../theme";
import { PdfReportData } from "../derive";
import { HeaderBar, FooterBar, formatGbp, formatGbpSigned, formatPercent } from "../components/Chrome";
import { BASE_PAGE_STYLES, H1, H2, Subtitle, SectionLabel, Divider } from "../components/Primitives";

const C = PDF_COLORS;

const s = StyleSheet.create({
  columns: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  column: {
    flex: 1,
    backgroundColor: C.WHITE,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  columnTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
    textAlign: "center",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  rowLabel: {
    fontSize: 8,
    color: C.DARK_GREY,
  },
  rowValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.CREAM,
  },
  netLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREY,
  },
  netValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
  },
  table: {
    marginTop: 4,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.DARK_GREEN,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    color: C.WHITE,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.CREAM,
  },
  tableRowAlt: {
    backgroundColor: C.ROW_STRIPE,
  },
  cellMonth: { flex: 1.4, fontSize: 8, color: C.DARK_GREY },
  cellNum: { flex: 1, fontSize: 8, color: C.DARK_GREY, textAlign: "right" },
  cellNumBold: {
    flex: 1,
    fontSize: 8,
    color: C.DARK_GREEN,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  peakTag: {
    backgroundColor: C.MINT_GREEN,
    color: C.DARK_GREEN,
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
});

interface Props {
  data: PdfReportData;
}

export function Page2Revenue({ data }: Props) {
  const { shortLetAnnual, longLetAnnual, monthly } = data;

  return (
    <Page size="A4" style={BASE_PAGE_STYLES.page}>
      <HeaderBar />

      <H1>Revenue Breakdown</H1>
      <Subtitle>Annual cost structure and month-by-month forecast</Subtitle>

      <SectionLabel>ANNUAL BREAKDOWN</SectionLabel>
      <View style={s.columns}>
        <View style={s.column}>
          <Text style={s.columnTitle}>Short-Let Strategy</Text>
          <View style={s.row}>
            <Text style={s.rowLabel}>Gross revenue</Text>
            <Text style={s.rowValue}>{formatGbp(shortLetAnnual.gross)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Platform fee (15%)</Text>
            <Text style={s.rowValue}>−{formatGbp(shortLetAnnual.platformFee)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Management (15%)</Text>
            <Text style={s.rowValue}>−{formatGbp(shortLetAnnual.managementFee)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Cleaning (18%)</Text>
            <Text style={s.rowValue}>−{formatGbp(shortLetAnnual.cleaning)}</Text>
          </View>
          <View style={s.netRow}>
            <Text style={s.netLabel}>Net annual</Text>
            <Text style={s.netValue}>{formatGbp(shortLetAnnual.net)}</Text>
          </View>
        </View>
        <View style={s.column}>
          <Text style={s.columnTitle}>Long-Let Strategy</Text>
          <View style={s.row}>
            <Text style={s.rowLabel}>Gross rent</Text>
            <Text style={s.rowValue}>{formatGbp(longLetAnnual.gross)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Agent fee (10%)</Text>
            <Text style={s.rowValue}>−{formatGbp(longLetAnnual.agentFee)}</Text>
          </View>
          <View style={s.netRow}>
            <Text style={s.netLabel}>Net annual</Text>
            <Text style={s.netValue}>{formatGbp(longLetAnnual.net)}</Text>
          </View>
        </View>
      </View>

      <Divider />

      <H2>Monthly Forecast</H2>
      <View style={s.table}>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { flex: 1.4 }]}>MONTH</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" }]}>NET</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" }]}>VS LTL</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" }]}>OCC</Text>
        </View>
        {monthly.map((m, i) => (
          <View
            key={m.month}
            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
          >
            <View style={{ flex: 1.4, flexDirection: "row", alignItems: "center" }}>
              <Text style={s.cellMonth}>{m.month}</Text>
              {m.peak ? <Text style={s.peakTag}>PEAK</Text> : null}
            </View>
            <Text style={s.cellNumBold}>{formatGbp(m.net)}</Text>
            <Text style={s.cellNum}>{formatGbpSigned(m.vsLtl)}</Text>
            <Text style={s.cellNum}>{formatPercent(m.occupancy)}</Text>
          </View>
        ))}
      </View>

      <FooterBar />
    </Page>
  );
}
