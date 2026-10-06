// ─── Internal analyse-for-Monday-lead endpoint ─────────────────────
//
// Runs the analyser for a lead that is ALREADY on the Monday Management Leads
// board but never went through the public calculator (Facebook lead-form
// leads, manual entries), and attaches the PDF + figures to THAT item —
// exactly as a bulk row does.
//
//   curl -X POST -H "x-internal-secret: <INTERNAL_API_SECRET>" \
//        -H "content-type: application/json" \
//        -d '{"monday_item_id":"123","address":"42 Foo Road, CV2 3BP",
//             "postcode":"CV2 3BP","bedrooms":3,"email":"a@b.com",
//             "property_type":"Terraced"}' \
//        https://<host>/api/internal/analyse-lead
//
// Called twice a day by the n8n "Stray lead reports" workflow.
//
// ── Why a new route rather than /api/internal/analyse ───────────────
// That route is the lead database's and is built to NEVER touch Monday (see its
// header). This one exists precisely to write to Monday, so mixing the two
// would weaken the other route's guarantee. Same secret, separate door.
//
// ── Fixed defaults for these leads (agreed with Zac, 6 Oct 2026) ────
//   • Parking: "Free on-street only" (on_street) — counts as no space, so a
//     lead we know nothing about never gets a parking uplift.
//   • Email: the lead's own email. Usage is NOT incremented, so this never
//     spends the lead's free calculator analyses.
//   • Property type: resolved by resolvePropertyType() (lib/pipeline/propertyType); the source used
//     is returned so the caller can note it on the Monday item.
//
// ── Safety ──────────────────────────────────────────────────────────
// The bulk side-effect gate is applied, so a run built on missing or
// synthetic upstream data never reaches the board. mondayItemId is passed
// explicitly, so the PDF can only land on the item the caller named — never on
// a different lead matched by email.

import { normaliseAnalysisInput, defaultGuests } from '@/lib/pipeline/input';
import { runAnalysis } from '@/lib/pipeline/runAnalysis';
import { bulkSideEffectGate } from '@/lib/bulk/gate';
import { resolvePropertyType } from '@/lib/pipeline/propertyType';

export const runtime = 'nodejs';
// Hobby ceiling — see /api/internal/analyse for why a worst case is a retry.
export const maxDuration = 60;

let inFlight = 0;
const MAX_INFLIGHT = Number(process.env.INTERNAL_ANALYSE_MAX_INFLIGHT ?? 4);

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return Response.json({ error: 'Not found' }, { status: 404 });
  if (request.headers.get('x-internal-secret') !== expected) {
    return Response.json({ error: 'Unauthorized', error_code: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body', error_code: 'invalid_input' }, { status: 400 });
  }

  const mondayItemId = String(body.monday_item_id ?? '').trim();
  if (!/^\d+$/.test(mondayItemId)) {
    return Response.json(
      { error: 'monday_item_id is required', error_code: 'invalid_input' },
      { status: 400 },
    );
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const propertyType = resolvePropertyType(address, body.property_type);
  const bedrooms = Number(body.bedrooms);

  const normalised = normaliseAnalysisInput({
    address: body.address,
    postcode: body.postcode,
    bedrooms: body.bedrooms,
    guests: Number.isFinite(bedrooms) ? defaultGuests(bedrooms) : undefined,
    email: body.email,
    propertyType: propertyType.type,
    parking: 'on_street',
    // Long let left for PropertyData to estimate, as bulk and "Not sure" do.
    longLetNotSure: true,
  });

  if (!normalised.ok) {
    return Response.json(
      { ok: false, error: normalised.error, error_code: 'invalid_input', monday_item_id: mondayItemId },
      { status: 400 },
    );
  }

  if (inFlight >= MAX_INFLIGHT) {
    return Response.json({ error: 'Too many analyses in flight', error_code: 'busy' }, { status: 429 });
  }

  inFlight += 1;
  try {
    const outcome = await runAnalysis(normalised.input, {
      reportSource: 'monday_backfill',
      incrementUsage: false,
      mondayItemId,
      sideEffectGate: bulkSideEffectGate,
    });

    if (!outcome.ok) {
      return Response.json({
        ok: false,
        monday_item_id: mondayItemId,
        stage: outcome.stage,
        error_code: outcome.errorCode,
        error: outcome.error,
        // A geocode failure will fail again; anything else may be transient.
        retryable: outcome.stage !== 'geocode',
      });
    }

    const rec = outcome.result.recommendation;
    return Response.json({
      ok: true,
      monday_item_id: mondayItemId,
      property_type: propertyType.type,
      property_type_source: propertyType.source,
      parking: 'on_street',
      pdf_uploaded: outcome.pdfUploaded === true,
      monday_synced: outcome.mondaySynced === true,
      gated_reason: outcome.sideEffectsSkippedReason ?? null,
      recommendation: rec?.recommendation ?? null,
      uplift_pct: rec?.upliftPct ?? null,
      str_net_annual: rec ? Math.round(rec.trueSTRNet) : null,
      long_let_net_annual: rec ? Math.round(rec.trueLLNet) : null,
    });
  } catch (err) {
    console.error('[internal/analyse-lead] unexpected failure:', err);
    return Response.json(
      { ok: false, error: 'Internal error', error_code: 'internal', retryable: true, monday_item_id: mondayItemId },
      { status: 500 },
    );
  } finally {
    inFlight -= 1;
  }
}
