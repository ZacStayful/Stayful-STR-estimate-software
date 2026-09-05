-- Market signals for the Market Explorer (Stayful Intelligence /markets).
--
-- Adds per-report "signal" columns that the explorer aggregates per postcode
-- area: how competitive the local market is (review depth, listing age,
-- listing density), what drives demand there (hospitals / universities /
-- transport / events counts) and where the report sits (lat/lng, used to
-- centre the planning-applications lookup below).
--
-- New live rows are written by src/lib/pipeline/marketSignals.ts. Existing
-- rows are backfilled here from raw_response (the full AnalysisResult), which
-- is why raw_response must never be dropped. Rows without raw_response (the
-- Monday PDF backfill) have nothing to extract and keep market_signals_version
-- NULL — the aggregation averages only non-null values, so they simply don't
-- contribute to these metrics.
--
-- Units:
--   comp_avg_occupancy   PERCENT 0–100 (comparables carry a 0–1 fraction; ×100)
--   comp_avg_listing_age years
--   listing_density      listings per km² = active_listings / (π · search_radius_km²)
--
-- Why listing_density rather than active_listings: active_listings is the
-- Airbtics match count at whatever radius the comparable search ended on
-- (0.4 km → 8 km, widened until 12 comparables were found), and the V2 report
-- path sets it to the comparable count itself (≤ 12). Raw counts are therefore
-- not comparable across reports; density at the recorded radius is. A count of
-- ≤ 12 is treated as unknown for that reason.
--
-- Idempotent: safe to re-run.

alter table analyser_reports
  add column if not exists comp_avg_rating        numeric,
  add column if not exists comp_avg_review_count  numeric,
  add column if not exists comp_avg_listing_age   numeric,
  add column if not exists active_listings        int,
  add column if not exists search_radius_km       numeric,
  add column if not exists listing_density        numeric,
  add column if not exists demand_hospitals       int,
  add column if not exists demand_universities    int,
  add column if not exists demand_transport       int,
  add column if not exists demand_events          int,
  add column if not exists lat                    numeric,
  add column if not exists lng                    numeric,
  add column if not exists market_signals_version int;

create index if not exists idx_analyser_reports_area_created
  on analyser_reports (postcode_area, created_at);

-- ── Backfill 1/2: comparable-set aggregates ─────────────────────────────
with comp as (
  select
    r.id,
    count(*)                                                   as comp_count,
    avg((c->>'averageDailyRate')::numeric)                     as comp_avg_adr,
    avg((c->>'occupancyRate')::numeric) * 100                  as comp_avg_occupancy,
    avg((c->>'annualRevenue')::numeric)                        as comp_avg_annual_revenue,
    -- rating is 0 for unreviewed listings: average only over reviewed ones
    avg(nullif((c->>'rating')::numeric, 0))
      filter (where coalesce((c->>'reviewCount')::numeric, 0) > 0) as comp_avg_rating,
    avg((c->>'reviewCount')::numeric)                          as comp_avg_review_count,
    avg((c->>'listingAge')::numeric)                           as comp_avg_listing_age
  from analyser_reports r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.raw_response->'shortLet'->'comparables') = 'array'
         then r.raw_response->'shortLet'->'comparables' else '[]'::jsonb end
  ) c
  where r.raw_response is not null
    and r.market_signals_version is null
  group by r.id
)
update analyser_reports r
set comp_count              = comp.comp_count,
    comp_avg_adr            = round(comp.comp_avg_adr, 2),
    comp_avg_occupancy      = round(comp.comp_avg_occupancy, 2),
    comp_avg_annual_revenue = round(comp.comp_avg_annual_revenue, 2),
    comp_avg_rating         = round(comp.comp_avg_rating, 3),
    comp_avg_review_count   = round(comp.comp_avg_review_count, 2),
    comp_avg_listing_age    = round(comp.comp_avg_listing_age, 2)
from comp
where comp.id = r.id;

-- ── Backfill 2/2: listings, demand drivers, coordinates; stamp the version ──
update analyser_reports r
set active_listings     = nullif((r.raw_response->'shortLet'->>'activeListings')::int, 0),
    search_radius_km    = (r.raw_response->'dataQuality'->>'searchRadiusKm')::numeric,
    comp_radius_km      = coalesce(r.comp_radius_km, (r.raw_response->'dataQuality'->>'searchRadiusKm')::numeric),
    demand_hospitals    = jsonb_array_length(coalesce(r.raw_response->'demandDrivers'->'hospitals',     '[]'::jsonb)),
    demand_universities = jsonb_array_length(coalesce(r.raw_response->'demandDrivers'->'universities',  '[]'::jsonb)),
    demand_transport    = jsonb_array_length(coalesce(r.raw_response->'demandDrivers'->'trainStations', '[]'::jsonb))
                        + jsonb_array_length(coalesce(r.raw_response->'demandDrivers'->'busStations',   '[]'::jsonb))
                        + jsonb_array_length(coalesce(r.raw_response->'demandDrivers'->'subwayStations','[]'::jsonb)),
    demand_events       = (r.raw_response->'nearbyEvents'->>'totalEvents')::int,
    lat                 = (r.raw_response->'coordinates'->>'lat')::numeric,
    lng                 = (r.raw_response->'coordinates'->>'lng')::numeric,
    market_signals_version = 1
where r.raw_response is not null
  and r.market_signals_version is null;

-- Density from the two columns just set (kept as a separate statement so the
-- rule lives in one place and matches marketSignals.ts).
update analyser_reports
set listing_density = round(active_listings / (pi() * search_radius_km * search_radius_km), 3)
where market_signals_version = 1
  and listing_density is null
  and active_listings > 12
  and search_radius_km > 0;

-- ── Contractor-demand signal: large planning applications per area ──────
-- Filled monthly by /api/internal/refresh-planning from the public PlanIt
-- API, centred on the mean coordinates of each area's reports.
create table if not exists area_planning_signals (
  postcode_area       text primary key,
  lat                 numeric not null,
  lng                 numeric not null,
  radius_km           numeric not null,
  large_apps_12m      int,
  large_apps_prev_12m int,
  fetched_at          timestamptz not null default now(),
  source              text not null default 'planit'
);

-- Touched only by server code holding the service-role key, which bypasses
-- RLS. Enabled with no policies so nothing else can read it.
alter table area_planning_signals enable row level security;
