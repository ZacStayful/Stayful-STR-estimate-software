import { getSupabase } from '@/lib/supabase';
import { occupancyToPercent } from '@/lib/utils/occupancy';

// ─── Market Explorer aggregation endpoint ──────────────────────────
// Internal only — same x-internal-secret gate as /api/reports/count.
// Feeds the "Market Explorer" area-browsing feature in Stayful
// Intelligence (intelligence.stayful.co.uk). Aggregates analyser_reports
// by postcode_area + bedrooms so the frontend never touches the raw
// per-lead rows.
//
//   curl -H "x-internal-secret: <INTERNAL_API_SECRET>" \
//        "https://<host>/api/market-stats?area=NG&bedrooms=2&min_samples=5"
//
// Query params (all optional):
//   area          UK postcode area letter prefix, e.g. "NG". Omit for all areas.
//   bedrooms      Filter to one bedroom count.
//   min_samples   Default 5. Any (postcode_area, bedrooms) combination with
//                 fewer than this many samples is dropped entirely — never
//                 returned with a "low confidence" flag. An area whose every
//                 bedroom group falls below the threshold is omitted outright.
//
// Units, matching what the frontend expects (NOT the raw DB units):
//   avg_adr                  GBP/night, rounded to the nearest pound
//   avg_occupancy            PERCENTAGE 0–100, one decimal place.
//                             analyser_reports.occupancy holds MIXED units —
//                             the live analyser writes a 0–1 fraction, the
//                             Monday PDF-backfill rows stored a 0–100 percentage
//                             — so each row is normalised via occupancyToPercent
//                             (value ≤ 1 → ×100; value > 1 → already a %), not a
//                             blind ×100 which would turn 55.6 into 5560.
//   avg_gross_revenue / avg_net_revenue
//   avg_property_value_low / avg_property_value_high
//                             GBP, rounded to the nearest pound
//
// Every average is computed only over the rows in its group that have a
// non-null value for that specific field; if a group has zero non-null
// values for a field, that field is returned as null (never 0, never NaN)
// so the frontend can distinguish "no data" from "genuinely zero".
//
// Rows with extraction_status = 'error' (failed PDF extraction from the
// Monday backfill pipeline) are excluded — their revenue/ADR figures are
// not trustworthy. Rows with extraction_status null or 'ok' are included.

export const runtime = 'nodejs';

interface ReportRow {
  postcode_area: string | null;
  bedrooms: number | null;
  adr: number | null;
  occupancy: number | null;
  gross_revenue: number | null;
  net_revenue: number | null;
  property_value_low: number | null;
  property_value_high: number | null;
  extraction_status: string | null;
}

interface BedroomAgg {
  bedrooms: number;
  sample_count: number;
  avg_adr: number | null;
  avg_occupancy: number | null;
  avg_gross_revenue: number | null;
  avg_net_revenue: number | null;
  avg_property_value_low: number | null;
  avg_property_value_high: number | null;
}

function average(values: (number | null)[], decimals = 0): number | null {
  const nonNull = values.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (nonNull.length === 0) return null;
  const mean = nonNull.reduce((sum, v) => sum + v, 0) / nonNull.length;
  const factor = 10 ** decimals;
  return Math.round(mean * factor) / factor;
}

export async function GET(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const provided = request.headers.get('x-internal-secret');
  if (provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Storage not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const areaParam = url.searchParams.get('area');
  const bedroomsParam = url.searchParams.get('bedrooms');
  const minSamplesParam = url.searchParams.get('min_samples');

  const area = areaParam ? areaParam.trim().toUpperCase() : null;

  let bedrooms: number | null = null;
  if (bedroomsParam !== null) {
    const parsed = Number(bedroomsParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return Response.json({ error: 'bedrooms must be a non-negative integer' }, { status: 400 });
    }
    bedrooms = parsed;
  }

  let minSamples = 5;
  if (minSamplesParam !== null) {
    const parsed = Number(minSamplesParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return Response.json({ error: 'min_samples must be a positive integer' }, { status: 400 });
    }
    minSamples = parsed;
  }

  let query = supabase
    .from('analyser_reports')
    .select(
      'postcode_area, bedrooms, adr, occupancy, gross_revenue, net_revenue, property_value_low, property_value_high, extraction_status',
    )
    .not('postcode_area', 'is', null)
    .not('bedrooms', 'is', null)
    .or('extraction_status.is.null,extraction_status.eq.ok')
    .range(0, 49999);

  if (area) {
    query = query.eq('postcode_area', area);
  }
  if (bedrooms !== null) {
    query = query.eq('bedrooms', bedrooms);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[market-stats] query failed:', error);
    return Response.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as ReportRow[];

  const grouped = new Map<string, Map<number, ReportRow[]>>();
  for (const row of rows) {
    if (row.postcode_area === null || row.bedrooms === null) continue;
    if (!grouped.has(row.postcode_area)) {
      grouped.set(row.postcode_area, new Map());
    }
    const byBedrooms = grouped.get(row.postcode_area)!;
    if (!byBedrooms.has(row.bedrooms)) {
      byBedrooms.set(row.bedrooms, []);
    }
    byBedrooms.get(row.bedrooms)!.push(row);
  }

  const areas: { postcode_area: string; total_sample_count: number; by_bedrooms: BedroomAgg[] }[] = [];

  for (const [postcodeArea, byBedrooms] of grouped) {
    const bedroomAggs: BedroomAgg[] = [];

    for (const [bedroomCount, groupRows] of byBedrooms) {
      if (groupRows.length < minSamples) continue;

      bedroomAggs.push({
        bedrooms: bedroomCount,
        sample_count: groupRows.length,
        avg_adr: average(groupRows.map((r) => r.adr), 0),
        avg_occupancy: average(
          groupRows.map((r) => occupancyToPercent(r.occupancy)),
          1,
        ),
        avg_gross_revenue: average(groupRows.map((r) => r.gross_revenue), 0),
        avg_net_revenue: average(groupRows.map((r) => r.net_revenue), 0),
        avg_property_value_low: average(groupRows.map((r) => r.property_value_low), 0),
        avg_property_value_high: average(groupRows.map((r) => r.property_value_high), 0),
      });
    }

    if (bedroomAggs.length === 0) continue;

    bedroomAggs.sort((a, b) => a.bedrooms - b.bedrooms);

    areas.push({
      postcode_area: postcodeArea,
      total_sample_count: bedroomAggs.reduce((sum, b) => sum + b.sample_count, 0),
      by_bedrooms: bedroomAggs,
    });
  }

  areas.sort((a, b) => a.postcode_area.localeCompare(b.postcode_area));

  return Response.json({
    areas,
    min_samples_threshold: minSamples,
    generated_at: new Date().toISOString(),
  });
}
