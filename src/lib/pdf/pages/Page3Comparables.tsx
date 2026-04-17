import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS } from "../theme";
import { PdfReportData } from "../derive";
import {
  HeaderBar,
  FooterBar,
  formatGbp,
  formatPercent,
  formatRating,
} from "../components/Chrome";
import {
  BASE_PAGE_STYLES,
  H1,
  H2,
  Subtitle,
  SectionLabel,
  Divider,
  MetricCard,
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
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.CREAM,
    alignItems: "center",
  },
  tableRowAlt: { backgroundColor: C.ROW_STRIPE },
  cName: { flex: 2.4, fontSize: 7, color: C.DARK_GREY, paddingRight: 4 },
  cDist: { flex: 1, fontSize: 7, color: C.DARK_GREY, textAlign: "right" },
  cNum: { flex: 1, fontSize: 7, color: C.DARK_GREY, textAlign: "right" },
  cNumBold: {
    flex: 1,
    fontSize: 7,
    color: C.DARK_GREEN,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  nameWithTag: {
    flex: 2.4,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  targetsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  targetCard: {
    flex: 1,
    backgroundColor: C.WHITE,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  targetTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
    textAlign: "center",
    marginBottom: 4,
  },
  targetSub: {
    fontSize: 7,
    color: C.DARK_GREY,
    textAlign: "center",
    marginBottom: 6,
  },
  targetLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  targetLabel: { fontSize: 8, color: C.DARK_GREY },
  targetValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
  },
});

interface Props {
  data: PdfReportData;
}

export function Page3Comparables({ data }: Props) {
  const { comparables, compsBenchmark, marketTargets } = data;
  const topCount = comparables.slice(0, 10);

  return (
    <Page size="A4" style={BASE_PAGE_STYLES.page}>
      <HeaderBar />

      <H1>Comparable Listings</H1>
      <Subtitle>
        {compsBenchmark.count} comps within {compsBenchmark.radiusKm.toFixed(1)} km ·
        ranked by annual revenue
      </Subtitle>

      <SectionLabel>BENCHMARK AVERAGES</SectionLabel>
      <View style={[BASE_PAGE_STYLES.row, BASE_PAGE_STYLES.gap8]}>
        <MetricCard
          label="Avg Nightly"
          value={formatGbp(compsBenchmark.avgNightly)}
        />
        <MetricCard
          label="Avg Occupancy"
          value={formatPercent(compsBenchmark.avgOccupancy)}
        />
        <MetricCard
          label="Avg Annual"
          value={formatGbp(compsBenchmark.avgAnnual)}
        />
        <MetricCard
          label="Avg Rating"
          value={formatRating(compsBenchmark.avgRating)}
          sub={`${compsBenchmark.avgReviews} reviews`}
        />
      </View>

      <Divider />

      <View style={s.table}>
        <View style={s.tableHeader}>
          <Text style={[s.headerCell, { flex: 2.4 }]}>LISTING</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>DIST</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>NIGHTLY</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>OCC</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>ANNUAL</Text>
          <Text style={[s.headerCell, { flex: 1, textAlign: "right" }]}>RATING</Text>
        </View>
        {topCount.map((c, i) => (
          <View
            key={`${c.name}-${i}`}
            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
          >
            <View style={s.nameWithTag}>
              <Text style={s.cName}>{c.name}</Text>
              {c.top ? (
                <Pill background={C.MINT_GREEN} color={C.DARK_GREEN}>
                  TOP
                </Pill>
              ) : null}
            </View>
            <Text style={s.cDist}>{c.distance}</Text>
            <Text style={s.cNum}>{formatGbp(c.nightly)}</Text>
            <Text style={s.cNum}>{formatPercent(c.occupancy)}</Text>
            <Text style={s.cNumBold}>{formatGbp(c.annual)}</Text>
            <Text style={s.cNum}>{formatRating(c.rating)}</Text>
          </View>
        ))}
      </View>

      <H2>Market Targets</H2>
      <View style={s.targetsRow}>
        <View style={s.targetCard}>
          <Text style={s.targetTitle}>Match the Market</Text>
          <Text style={s.targetSub}>Benchmark mean</Text>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Nightly rate</Text>
            <Text style={s.targetValue}>{formatGbp(marketTargets.matchNightly)}</Text>
          </View>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Occupancy</Text>
            <Text style={s.targetValue}>{formatPercent(marketTargets.matchOccupancy)}</Text>
          </View>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Annual revenue</Text>
            <Text style={s.targetValue}>{formatGbp(marketTargets.matchRevenue)}</Text>
          </View>
        </View>
        <View style={s.targetCard}>
          <Text style={s.targetTitle}>Beat the Market</Text>
          <Text style={s.targetSub}>Top 25% of local comps</Text>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Nightly rate</Text>
            <Text style={s.targetValue}>{formatGbp(marketTargets.beatNightly)}</Text>
          </View>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Occupancy</Text>
            <Text style={s.targetValue}>{formatPercent(marketTargets.beatOccupancy)}</Text>
          </View>
          <View style={s.targetLine}>
            <Text style={s.targetLabel}>Annual revenue</Text>
            <Text style={s.targetValue}>{formatGbp(marketTargets.beatRevenue)}</Text>
          </View>
        </View>
      </View>

      <FooterBar />
    </Page>
  );
}
