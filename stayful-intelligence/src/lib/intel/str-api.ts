/**
 * HTTP client for the existing Stayful STR estimate API.
 *
 * The upstream endpoint at `${INTERNAL_API_BASE_URL}/api/analyse` streams
 * progress events via Server-Sent Events. We consume the stream, ignore the
 * intermediate `stage` updates, and return the payload from the final
 * `{ stage: "complete", data: AnalysisResult }` event.
 *
 * The Intelligence app only exposes `address + guestCount` to users, so this
 * module fills in sensible defaults (postcode extraction, bedrooms from guest
 * count, top-spec finish) before shelling out to the upstream API. The shape
 * returned is flattened to the `EstimateResult` the UI renders.
 */

import { extractPostcode } from "./postcode";
import type { EstimateResult, MonthlyBreakdown, CompListing } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface StrApiError extends Error {
  code: "no_postcode" | "upstream_unreachable" | "upstream_error" | "no_data" | "internal";
  status: number;
}

function err(code: StrApiError["code"], status: number, message: string): StrApiError {
  const e = new Error(message) as StrApiError;
  e.code = code;
  e.status = status;
  return e;
}

function bedroomsFromGuests(guestCount: number): number {
  return Math.max(1, Math.min(10, Math.ceil(guestCount / 2)));
}

// Shape of the `data` field on the final SSE event. Intentionally narrow —
// we only type what we consume.
interface UpstreamResult {
  property: { address: string; postcode: string; bedrooms: number; guests: number };
  shortLet: {
    annualRevenue: number;
    monthlyRevenue: number[];
    occupancyRate: number;
    averageDailyRate: number;
    comparables: Array<{
      title: string;
      url: string;
      bedrooms: number;
      accommodates: number;
      averageDailyRate: number;
      occupancyRate: number;
      annualRevenue: number;
      distance?: number;
    }>;
    scenarios?: {
      base?: {
        monthly: Array<{ label: string; adr: number; occupancy: number; revenue: number }>;
      };
    };
  };
  financials: {
    longLetGrossAnnual: number;
    annualDifference: number;
  };
  dataQuality?: {
    comparablesFound: number;
    comparablesTarget: number;
  };
}

interface UpstreamEvent {
  stage: string;
  progress?: number;
  message?: string;
  data?: UpstreamResult;
}

function getUpstreamBase(): string {
  const raw = process.env.INTERNAL_API_BASE_URL;
  if (!raw) {
    throw err(
      "internal",
      500,
      "INTERNAL_API_BASE_URL is not configured. Set it to the base URL of the existing STR estimate deployment.",
    );
  }
  return raw.replace(/\/$/, "");
}

async function readSseStream(response: Response): Promise<UpstreamResult> {
  if (!response.body) {
    throw err("upstream_error", 502, "STR API returned an empty body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastError: string | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE separates events with a blank line (\n\n). Process every complete event.
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLine = block
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      let event: UpstreamEvent;
      try {
        event = JSON.parse(dataLine.slice(5).trim()) as UpstreamEvent;
      } catch {
        continue;
      }

      if (event.stage === "error") {
        lastError = event.message ?? "STR API error";
        continue;
      }
      if (event.stage === "complete" && event.data) {
        return event.data;
      }
    }
  }

  throw err(
    "upstream_error",
    502,
    lastError ?? "STR API stream ended before a complete estimate arrived.",
  );
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

  const base = getUpstreamBase();
  const upstreamUrl = `${base}/api/analyse`;

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        address,
        postcode,
        bedrooms,
        guests: guestCount,
        // Defaults chosen to match the most common UK Airbnb supply and to keep
        // the estimate a fair "top-spec" baseline — users can be more specific
        // in the original STR tool if they want to refine.
        propertyType: "Flat",
        parking: "no_parking",
        outdoorSpace: "none",
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw err("upstream_unreachable", 502, `Could not reach STR API: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw err("upstream_error", res.status, `STR API returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const upstream = await readSseStream(res);
  const shortLet = upstream.shortLet;
  if (!shortLet || shortLet.annualRevenue <= 0) {
    throw err(
      "no_data",
      422,
      "Not enough Airbnb data to estimate this property. Try a more central UK address.",
    );
  }

  const baseScenario = shortLet.scenarios?.base;
  const monthlyBreakdown: MonthlyBreakdown[] = baseScenario
    ? baseScenario.monthly.map((m, i) => ({
        month: MONTHS[i] ?? m.label,
        revenue: Math.round(m.revenue),
        occupancy: Number(m.occupancy.toFixed(2)),
        adr: Math.round(m.adr),
      }))
    : shortLet.monthlyRevenue.map((revenue, i) => {
        const share = revenue / (shortLet.annualRevenue || 1);
        const occupancy = Math.max(0.05, Math.min(0.99, shortLet.occupancyRate * (share * 12)));
        return {
          month: MONTHS[i] ?? `M${i + 1}`,
          revenue: Math.round(revenue),
          occupancy: Number(occupancy.toFixed(2)),
          adr: Math.round(shortLet.averageDailyRate),
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
    upstream.dataQuality && upstream.dataQuality.comparablesFound < 12
      ? `Estimate based on ${upstream.dataQuality.comparablesFound} comparable listings (limited data in this area).`
      : undefined;

  return {
    address,
    guestCount,
    annualRevenue: Math.round(shortLet.annualRevenue),
    occupancyRate: Number(shortLet.occupancyRate.toFixed(2)),
    medianADR: Math.round(shortLet.averageDailyRate),
    longLetAnnual: upstream.financials.longLetGrossAnnual,
    saVsLongLetUplift: upstream.financials.annualDifference,
    monthlyBreakdown,
    compSet,
    dataQualityNote,
  };
}
