import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS } from "../theme";
import { PdfReportData } from "../derive";
import { HeaderBar, FooterBar, formatGbp, formatGbpSigned, formatPercent } from "../components/Chrome";
import {
  BASE_PAGE_STYLES,
  H1,
  H2,
  Subtitle,
  SectionLabel,
  Divider,
  MetricCard,
} from "../components/Primitives";

const C = PDF_COLORS;

const s = StyleSheet.create({
  heroCard: {
    backgroundColor: C.DARK_GREEN,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 6,
    marginBottom: 12,
    alignItems: "center",
  },
  heroLabel: {
    color: C.CREAM,
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  heroValue: {
    color: C.WHITE,
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  heroSub: {
    color: C.MINT_GREEN,
    fontSize: 9,
  },
  compareCard: {
    marginTop: 10,
    backgroundColor: C.WHITE,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },
  compareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  compareLabel: {
    fontSize: 9,
    color: C.DARK_GREY,
  },
  compareValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
  },
  compareUplift: {
    marginTop: 6,
    padding: 6,
    borderRadius: 4,
    backgroundColor: C.MINT_GREEN,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
  },
  propLine: {
    fontSize: 9,
    color: C.DARK_GREY,
    textAlign: "center",
    marginBottom: 8,
  },
});

interface Props {
  data: PdfReportData;
}

export function Page1Overview({ data }: Props) {
  const { property, overview, strVsLtl } = data;
  const valueLine =
    overview.valueConservative && overview.valueUpper
      ? `Estimated value ${formatGbp(overview.valueConservative)} – ${formatGbp(overview.valueUpper)}`
      : "Estimated property value unavailable";

  return (
    <Page size="A4" style={BASE_PAGE_STYLES.page}>
      <HeaderBar />

      <H1>Property Income Analysis</H1>
      <Subtitle>{property.address}</Subtitle>
      <Text style={s.propLine}>
        {property.bedrooms} bed · Sleeps {property.sleeps} · {valueLine}
      </Text>

      <View style={s.heroCard}>
        <Text style={s.heroLabel}>PROJECTED NET ANNUAL REVENUE</Text>
        <Text style={s.heroValue}>{formatGbp(overview.netRevenue)}</Text>
        <Text style={s.heroSub}>
          Gross {formatGbp(overview.grossRevenue)} · Net margin{" "}
          {formatPercent(
            overview.grossRevenue > 0 ? overview.netRevenue / overview.grossRevenue : 0
          )}
        </Text>
      </View>

      <SectionLabel>KEY METRICS</SectionLabel>
      <View style={[BASE_PAGE_STYLES.row, BASE_PAGE_STYLES.gap8]}>
        <MetricCard
          label="Monthly Net"
          value={formatGbp(overview.netMonthly)}
          sub={`Gross ${formatGbp(overview.grossMonthly)}`}
        />
        <MetricCard
          label="ADR"
          value={formatGbp(overview.adr)}
          sub="Average daily rate"
        />
        <MetricCard
          label="Occupancy"
          value={formatPercent(overview.occupancy)}
          sub={`Market ${formatPercent(overview.marketOccupancy)}`}
        />
      </View>

      <Divider />

      <H2>Short-Let vs Long-Let</H2>
      <View style={s.compareCard}>
        <View style={s.compareRow}>
          <Text style={s.compareLabel}>Short-let net (annual)</Text>
          <Text style={s.compareValue}>{formatGbp(overview.netRevenue)}</Text>
        </View>
        <View style={s.compareRow}>
          <Text style={s.compareLabel}>Long-let net (annual)</Text>
          <Text style={s.compareValue}>
            {formatGbp(overview.netRevenue - strVsLtl.annualDiff)}
          </Text>
        </View>
        <View style={s.compareRow}>
          <Text style={s.compareLabel}>Annual uplift</Text>
          <Text style={s.compareValue}>{formatGbpSigned(strVsLtl.annualDiff)}</Text>
        </View>
        <View style={s.compareRow}>
          <Text style={s.compareLabel}>Monthly uplift</Text>
          <Text style={s.compareValue}>{formatGbpSigned(strVsLtl.monthlyDiff)}</Text>
        </View>
        <Text style={s.compareUplift}>
          {strVsLtl.percentUplift >= 0 ? "+" : ""}
          {strVsLtl.percentUplift}% vs long-let
        </Text>
      </View>

      <FooterBar />
    </Page>
  );
}
