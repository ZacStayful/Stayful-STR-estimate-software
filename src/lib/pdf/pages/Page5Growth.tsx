import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS } from "../theme";
import { PdfReportData } from "../derive";
import { HeaderBar, FooterBar, formatGbp } from "../components/Chrome";
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
  amenityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  amenityCol: {
    flex: 1,
    backgroundColor: C.WHITE,
    borderColor: C.CREAM,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  amenityTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.DARK_GREEN,
    textAlign: "center",
    marginBottom: 6,
  },
  amenityItem: {
    fontSize: 8,
    color: C.DARK_GREY,
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: C.CREAM,
  },
  growthCard: {
    marginTop: 6,
    backgroundColor: C.DARK_GREEN,
    borderRadius: 8,
    padding: 14,
  },
  growthTitle: {
    color: C.CREAM,
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  growthRow: {
    flexDirection: "row",
    gap: 8,
  },
  growthStat: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  growthValue: {
    color: C.WHITE,
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  growthLabel: {
    color: C.MINT_GREEN,
    fontSize: 7,
    textAlign: "center",
  },
  ctaCard: {
    marginTop: 12,
    backgroundColor: C.MINT_GREEN,
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  ctaTitle: {
    color: C.DARK_GREEN,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "center",
  },
  ctaBody: {
    color: C.DARK_GREY,
    fontSize: 9,
    textAlign: "center",
    marginBottom: 6,
  },
  ctaContact: {
    color: C.DARK_GREEN,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
});

interface Props {
  data: PdfReportData;
}

export function Page5Growth({ data }: Props) {
  const { amenities, growth } = data;

  return (
    <Page size="A4" style={BASE_PAGE_STYLES.page}>
      <HeaderBar />

      <H1>Growth Path with Stayful</H1>
      <Subtitle>Amenity strategy and three-year growth outlook</Subtitle>

      <SectionLabel>RECOMMENDED AMENITIES</SectionLabel>
      <View style={s.amenityRow}>
        <View style={s.amenityCol}>
          <Text style={s.amenityTitle}>Essential</Text>
          {amenities.essential.map((a) => (
            <Text key={a} style={s.amenityItem}>
              {a}
            </Text>
          ))}
        </View>
        <View style={s.amenityCol}>
          <Text style={s.amenityTitle}>Recommended</Text>
          {amenities.recommended.map((a) => (
            <Text key={a} style={s.amenityItem}>
              {a}
            </Text>
          ))}
        </View>
        <View style={s.amenityCol}>
          <Text style={s.amenityTitle}>Differentiators</Text>
          {amenities.differentiators.map((a) => (
            <Text key={a} style={s.amenityItem}>
              {a}
            </Text>
          ))}
        </View>
      </View>

      <Divider />

      <H2>3-Year Stayful Outcomes</H2>
      <View style={[BASE_PAGE_STYLES.row, BASE_PAGE_STYLES.gap8]}>
        <MetricCard
          label="Direct Bookings"
          value={`${growth.directBookingPctMonth36}%`}
          sub="By month 36"
        />
        <MetricCard
          label="Repeat Customers"
          value={`${growth.repeatCustomers}+`}
          sub="Returning guest base"
        />
        <MetricCard
          label="Platform Fees Saved"
          value={`${growth.platformFeeSavingsPct}%`}
          sub="Of gross revenue"
        />
      </View>

      <View style={s.growthCard}>
        <Text style={s.growthTitle}>PROJECTED UPSIDE AT YEAR 3</Text>
        <View style={s.growthRow}>
          <View style={s.growthStat}>
            <Text style={s.growthValue}>{formatGbp(growth.extraMonthlyProfitYr3)}</Text>
            <Text style={s.growthLabel}>Extra net profit / month</Text>
          </View>
          <View style={s.growthStat}>
            <Text style={s.growthValue}>{formatGbp(growth.extraMonthlyProfitYr3 * 12)}</Text>
            <Text style={s.growthLabel}>Extra net profit / year</Text>
          </View>
          <View style={s.growthStat}>
            <Text style={s.growthValue}>{growth.directBookingPctMonth36}%</Text>
            <Text style={s.growthLabel}>Commission-free revenue</Text>
          </View>
        </View>
      </View>

      <View style={s.ctaCard}>
        <Text style={s.ctaTitle}>Ready to unlock this upside?</Text>
        <Text style={s.ctaBody}>
          Stayful handles pricing, listings, guests and ops — you keep more of the
          revenue you have worked hard to generate.
        </Text>
        <Text style={s.ctaContact}>stayful.co.uk · 07471 321 997</Text>
      </View>

      <FooterBar />
    </Page>
  );
}
