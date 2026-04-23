/**
 * Adapter that turns the legacy /api/analyse pipeline (postcode + bedrooms +
 * many extras) into the simpler `address + guestCount` shape the Intelligence
 * app exposes. We import the lib functions directly rather than HTTP-calling
 * the SSE route — same process, lower latency, no rate-limit double-jeopardy.
 */

import { geocodePostcode } from "@/lib/apis/geocode";
import { getShortLetData } from "@/lib/apis/airbtics";
import { getLongLetData, getFloorArea } from "@/lib/apis/propertydata";
import { calculateFinancials } from "@/lib/analysis";
import { extractPostcode } from "./postcode";
import type { EstimateResult, MonthlyBreakdown, CompListing } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface EstimateAdapterError extends Error {
  code: "no_postcode" | "geocode_failed" | "no_data" | "internal";
  status: number;
}

function err(code: EstimateAdapterError["code"], status: number, message: string): EstimateAdapterError {
  const e = new Error(message) as EstimateAdapterError;
  e.code = code;
  e.status = status;
  return e;
}

/**
 * Estimate bedrooms from guest count when the user only gives us guest capacity.
 * Roughly 2 guests per bedroom is the UK STR norm.
 */
function bedroomsFromGuests(guestCount: number): number {
  return Math.max(1, Math.min(10, Math.ceil(guestCount / 2)));
}

export async function runEstimate(input: {
  address: string;
  guestCount: number;
}): Promise<EstimateResult> {
  const address = input.address.trim();
  const guestCount = Math.max(1, Math.min(16, Math.floor(input.guestCount)));
  const postcode = extractPostcode(address);
  if (!postcode) {
    throw err(
      "no_postcode",
      400,
      "We couldn't find a UK postcode in that address. Please include the full postcode.",
    );
  }

  const bedrooms = bedroomsFromGuests(guestCount);

  let coordinates: { lat: number; lng: number };
  try {
    coordinates = await geocodePostcode(postcode);
  } catch {
    throw err("geocode_failed", 422, "We couldn't locate that postcode. Please check it and try again.");
  }

  const floorArea = await getFloorArea(postcode, address, bedrooms).catch(() => ({
    constructionDate: undefined,
    squareFeet: undefined,
  }));

  const [shortLetSettled, longLetSettled] = await Promise.allSettled([
    getShortLetData(postcode, bedrooms, guestCount, coordinates.lat, coordinates.lng, {
      hasParking: false,
      parkingSpaces: 0,
      finishQuality: "very_high",
      outdoorSpace: "none",
      propertyType: "flat",
      specialFeatures: [],
    }),
    getLongLetData(postcode, bedrooms, {
      propertyType: "flat",
      constructionDate: floorArea.constructionDate,
      internalArea: floorArea.squareFeet,
      finishQuality: "very_high",
      outdoorSpace: "none",
      offStreetParking: 0,
    }),
  ]);

  const shortLetWrapped = shortLetSettled.status === "fulfilled" ? shortLetSettled.value : null;
  const shortLet = shortLetWrapped?.data;
  const longLet = longLetSettled.status === "fulfilled" ? longLetSettled.value : null;

  if (!shortLet || shortLet.annualRevenue <= 0) {
    throw err(
      "no_data",
      422,
      "We couldn't find enough Airbnb data to estimate this property. Try a more central UK address.",
    );
  }

  const safeLongLet = longLet ?? { monthlyRent: 0, estimateHigh: 0, estimateLow: 0, comparables: [] };
  const financials = calculateFinancials(shortLet, safeLongLet);

  // Monthly breakdown: prefer scenarios.base if present, otherwise derive ADR /
  // occupancy by spreading the annual revenue across observed monthly weights.
  const baseScenario = shortLet.scenarios?.base;
  const monthlyBreakdown: MonthlyBreakdown[] = baseScenario
    ? baseScenario.monthly.map((m, i) => ({
        month: MONTHS[i] ?? m.label,
        revenue: Math.round(m.revenue),
        occupancy: Number(m.occupancy.toFixed(2)),
        adr: Math.round(m.adr),
      }))
    : shortLet.monthlyRevenue.map((revenue, i) => {
        const annualRevenue = shortLet.annualRevenue || 1;
        const share = revenue / annualRevenue;
        // back out occupancy assuming relative monthly demand maps to annual occupancy
        const occupancy = Math.max(0.05, Math.min(0.99, shortLet.occupancyRate * (share * 12)));
        const adr = shortLet.averageDailyRate;
        return {
          month: MONTHS[i],
          revenue: Math.round(revenue),
          occupancy: Number(occupancy.toFixed(2)),
          adr: Math.round(adr),
        };
      });

  const compSet: CompListing[] = (shortLet.comparables ?? []).slice(0, 12).map((c) => ({
    name: c.title,
    beds: c.bedrooms,
    guests: c.accommodates,
    distance: Number((c.distance ?? 0).toFixed(2)),
    occupancy: Number(c.occupancyRate.toFixed(2)),
    adr: Math.round(c.averageDailyRate),
    annualRevenue: Math.round(c.annualRevenue),
    url: c.url,
  }));

  const dataQualityNote =
    shortLetWrapped && shortLetWrapped.quality.comparablesFound < 12
      ? `Estimate based on ${shortLetWrapped.quality.comparablesFound} comparable listings (limited data in this area).`
      : undefined;

  return {
    address,
    guestCount,
    annualRevenue: Math.round(shortLet.annualRevenue),
    occupancyRate: Number(shortLet.occupancyRate.toFixed(2)),
    medianADR: Math.round(shortLet.averageDailyRate),
    longLetAnnual: financials.longLetGrossAnnual,
    saVsLongLetUplift: financials.annualDifference,
    monthlyBreakdown,
    compSet,
    dataQualityNote,
  };
}
