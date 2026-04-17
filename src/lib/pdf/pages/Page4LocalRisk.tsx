import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS } from "../theme";
import { PdfReportData } from "../derive";
import { HeaderBar, FooterBar } from "../components/Chrome";
import {
  BASE_PAGE_STYLES,
  H1,
  H2,
  Subtitle,
  SectionLabel,
  Divider,
  Pill,
} from "../components/Primitives";

const C = PDF_COLORS;

const s = StyleSheet.create({
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
  headerCell: {
    color: C.WHITE,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.CREAM,
    alignItems: "center",
  },
  tableRowAlt: { backgroundColor: C.ROW_STRIPE },
  cellType: { flex: 1.6, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.DARK_GREEN },
  cellText: { flex: 2.4, fontSize: 8, color: C.DARK_GREY, paddingRight: 4 },
  cellNum: { flex: 1, fontSize: 8, color: C.DARK_GREY, textAlign: "right" },
  cellCount: { flex: 0.8, fontSize: 8, color: C.DARK_GREY, textAlign: "right" },
  cellImpact: { flex: 0.9, flexDirection: "row", justifyContent: "flex-end" },
  scoreCard: {
    marginTop: 8,
    backgroundColor: C.DARK_GREEN,
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  scoreLabel: {
    color: C.CREAM,
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  scoreValue: {
    color: C.WHITE,
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  scoreSub: { color: C.MINT_GREEN, fontSize: 9 },
  riskGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 8,
  },
  riskCard: {
    width: "48.5%",
    backgroundColor: C.WHITE,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  riskLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
    marginBottom: 4,
  },
  riskBarOuter: {
    height: 6,
    backgroundColor: C.CREAM,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 3,
  },
  riskBarInner: {
    height: 6,
    backgroundColor: C.DARK_GREEN,
  },
  riskValue: {
    fontSize: 7,
    color: C.DARK_GREY,
    textAlign: "right",
  },
  overallLabel: {
    color: C.WHITE,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
});

interface Props {
  data: PdfReportData;
}

function scoreLabel(score: number): string {
  if (score <= 33) return "LOW";
  if (score <= 66) return "MEDIUM";
  return "HIGH";
}

export function Page4LocalRisk({ data }: Props) {
  const { demandDrivers, directBookingScore, risk } = data;

  const factorRows: { label: string; score: number }[] = [
    { label: "Revenue consistency", score: risk.factors.revenueConsistency },
    { label: "Long-term comparison", score: risk.factors.longTermComparison },
    { label: "Seasonal variance", score: risk.factors.seasonalVariance },
    { label: "Market demand", score: risk.factors.marketDemand },
  ];

  return (
    <Page size="A4" style={BASE_PAGE_STYLES.page}>
      <HeaderBar />

      <H1>Local Demand & Risk</H1>
      <Subtitle>Key demand drivers within the catchment + risk profile</Subtitle>

      <SectionLabel>DEMAND DRIVERS</SectionLabel>
      <View style={s.table}>
        <View style={s.tableHeader}>
          <Text style={[s.headerCell, { flex: 1.6 }]}>TYPE</Text>
          <Text style={[s.headerCell, { flex: 2.4 }]}>NEAREST</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>DIST</Text>
          <Text style={[s.headerCell, { flex: 0.8, textAlign: "right" }]}>COUNT</Text>
          <Text style={[s.headerCell, { flex: 0.9, textAlign: "right" }]}>IMPACT</Text>
        </View>
        {demandDrivers.length === 0 ? (
          <View style={s.tableRow}>
            <Text style={[s.cellText, { flex: 6 }]}>
              No major demand drivers detected within the search radius.
            </Text>
          </View>
        ) : (
          demandDrivers.map((d, i) => (
            <View
              key={`${d.type}-${i}`}
              style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            >
              <Text style={s.cellType}>{d.type}</Text>
              <Text style={s.cellText}>{d.nearest}</Text>
              <Text style={s.cellNum}>{d.distance}</Text>
              <Text style={s.cellCount}>{d.count}</Text>
              <View style={s.cellImpact}>
                <Pill
                  background={
                    d.impact === "HIGH"
                      ? C.DARK_GREEN
                      : d.impact === "MEDIUM"
                        ? C.MINT_GREEN
                        : C.LIGHT_GREY
                  }
                  color={d.impact === "MEDIUM" ? C.DARK_GREEN : C.WHITE}
                >
                  {d.impact}
                </Pill>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={s.scoreCard}>
        <Text style={s.scoreLabel}>DIRECT BOOKING POTENTIAL</Text>
        <Text style={s.scoreValue}>{directBookingScore} / 100</Text>
        <Text style={s.scoreSub}>{scoreLabel(directBookingScore)} demand strength</Text>
      </View>

      <Divider />

      <H2>Risk Profile</H2>
      <View style={s.scoreCard}>
        <Text style={s.scoreLabel}>OVERALL RISK SCORE</Text>
        <Text style={s.scoreValue}>{risk.overall} / 100</Text>
        <Text style={s.overallLabel}>{risk.label}</Text>
      </View>
      <View style={s.riskGrid}>
        {factorRows.map((f) => (
          <View key={f.label} style={s.riskCard}>
            <Text style={s.riskLabel}>{f.label}</Text>
            <View style={s.riskBarOuter}>
              <View style={[s.riskBarInner, { width: `${f.score}%` }]} />
            </View>
            <Text style={s.riskValue}>{f.score} / 100 · {scoreLabel(f.score)}</Text>
          </View>
        ))}
      </View>

      <FooterBar />
    </Page>
  );
}
