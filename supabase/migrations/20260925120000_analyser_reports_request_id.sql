-- Lead-database runs: one row per request, and no street address.
--
-- /api/internal/analyse serves the Stayful lead database, which pays to
-- analyse properties from a customer's OWN lead list. Each run is stored here
-- with source 'lead_db' and so feeds STR-Website-2's Market Explorer, which is
-- built from this table. Two things are needed for that to be right:
--
-- 1. request_id. The lead database gives up on a slow row at 45 seconds while
--    this app keeps running to its 60-second ceiling, so a run can finish and
--    be stored after the caller has already scheduled its retry — and the
--    retry then stores the same property a second time, counting it twice in
--    every Market Explorer figure. The caller's id (a lead_analysis_rows id) is
--    stored and made unique per source, so the retry finds the first row
--    instead (src/lib/pipeline/reportRow.ts, saveReportRow).
--
--    Nullable and partial: every other source writes no request_id, so every
--    existing row and every other insert is untouched. The code only writes
--    the column when a request id is given, so it is safe for this migration
--    to be applied first.
--
-- 2. No street address. New lead_db rows are written without one by
--    buildReportRow (address null, lat/lng and raw_response coordinates rounded
--    to 2 decimal places, raw_response.property.address replaced by the
--    postcode). The UPDATE below applies the same redaction to any lead_db row
--    stored before that code was live. There were none when this was written;
--    it is here so the guarantee does not depend on timing. Idempotent: re-run
--    it after the code deploys to catch any row written in between.

alter table analyser_reports
  add column if not exists request_id text;

create unique index if not exists analyser_reports_source_request_id_key
  on analyser_reports (source, request_id)
  where request_id is not null;

update analyser_reports
set
  address = null,
  lat = round(lat, 2),
  lng = round(lng, 2),
  raw_response = case
    when raw_response is null then null
    else jsonb_set(
      jsonb_set(
        raw_response,
        '{property,address}',
        coalesce(raw_response -> 'property' -> 'postcode', 'null'::jsonb),
        false
      ),
      '{coordinates}',
      jsonb_build_object(
        'lat', round(public.safe_numeric(raw_response -> 'coordinates' ->> 'lat'), 2),
        'lng', round(public.safe_numeric(raw_response -> 'coordinates' ->> 'lng'), 2)
      ),
      false
    )
  end
where source = 'lead_db'
  and address is not null;
