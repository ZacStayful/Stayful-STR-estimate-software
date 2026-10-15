#!/usr/bin/env node
/**
 * Pull our own properties' last-12-month booking actuals from Uplisting, so the
 * income model can be scored against what they really earned
 * (scripts/actuals-backtest.mjs).
 *
 * READ-ONLY. Every request goes through get(), which only ever sends GET and
 * only to /users/me, /properties and /bookings/:id. There is no code path that
 * creates, changes or cancels anything in Uplisting.
 *
 * Usage:
 *   UPLISTING_API_KEY=… node scripts/uplisting-actuals.mjs [--end YYYY-MM-DD]
 *
 *   --end   last night of the 365-night window (default: yesterday, UTC)
 *
 * Revenue is accommodation only (accomodation_total): cleaning fees and taxes
 * are excluded. Cleaning is totalled separately so the backtest can show the
 * like-for-like figure too (Airbtics revenue includes cleaning). Cancelled and
 * £0 bookings (owner stays, blocks) count for neither revenue nor nights. A
 * booking that straddles the window edge counts only its nights inside it, with
 * revenue pro-rated by night.
 *
 * Output (gitignored), with guest names, emails, phones and lock codes dropped
 * before anything is written:
 *   scripts/.backtest-data/uplisting/actuals.json
 *   scripts/.backtest-data/uplisting/bookings/<property_id>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '.backtest-data', 'uplisting');
const BASE_URL = 'https://connect.uplisting.io';
// Uplisting allows 5 req/s and 100 req/min per IP, and 15 req/min per property.
const GLOBAL_GAP_MS = 700;
const PROPERTY_GAP_MS = 4500;
const WORKERS = 4;
const PAUSED_AFTER_DAYS = 45;
// Fetch from this many days before the window so long stays that check in
// before it are still seen.
const LOOKBACK_DAYS = 120;
const ALLOWED_PATH = /^\/(users\/me|properties(\/\d+)?|bookings\/\d+)(\?.*)?$/;
const BOOKING_FIELDS = [
  'id', 'property_id', 'currency', 'check_in', 'check_out', 'number_of_nights', 'status', 'channel',
  'number_of_guests', 'accomodation_total', 'cleaning_fee', 'other_charges', 'commission', 'total_payout', 'booked_at',
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;
const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
const fromDay = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const num = (v) => (typeof v === 'number' ? v : Number.parseFloat(v ?? '')) || 0;

// ── HTTP (GET only) ───────────────────────────────────────────────

let globalChain = Promise.resolve();
let lastGlobal = 0;
function globalGate() {
  const turn = globalChain.then(async () => {
    const wait = lastGlobal + GLOBAL_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastGlobal = Date.now();
  });
  globalChain = turn;
  return turn;
}

const lastByProperty = new Map();
async function propertyGate(propertyId) {
  if (propertyId == null) return;
  const wait = (lastByProperty.get(propertyId) ?? 0) + PROPERTY_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastByProperty.set(propertyId, Date.now());
}

/** GET a path on the Uplisting API. Never sends any other method. */
async function get(path, authHeader, propertyId) {
  if (!ALLOWED_PATH.test(path)) throw new Error(`Refusing non-allowlisted path: ${path}`);
  for (let attempt = 0; ; attempt += 1) {
    await propertyGate(propertyId);
    await globalGate();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30000);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${path.split('?')[0]} → HTTP ${res.status}`);
    return res.json();
  }
}

// ── Properties ────────────────────────────────────────────────────

/** "hp11 1sa" → { compact: "HP111SA", formatted: "HP11 1SA" }, or null if it isn't a UK postcode. */
function normalisePostcode(raw) {
  const compact = String(raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return null;
  return { compact, formatted: `${compact.slice(0, -3)} ${compact.slice(-3)}` };
}

async function loadProperties(authHeader) {
  const properties = [];
  const included = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await get(page === 1 ? '/properties' : `/properties?page=${page}`, authHeader);
    const data = Array.isArray(body?.data) ? body.data : [];
    const fresh = data.filter((p) => !properties.some((q) => q.id === p.id));
    properties.push(...fresh);
    included.push(...(body?.included ?? []));
    const totalPages = body?.meta?.total_pages;
    if (fresh.length === 0 || !(Number(totalPages) > page)) break;
  }
  const addresses = new Map(included.filter((x) => x.type === 'addresses').map((x) => [x.id, x.attributes ?? {}]));
  return properties.map((p) => {
    const a = p.attributes ?? {};
    const address = addresses.get(p.relationships?.address?.data?.id) ?? {};
    return {
      id: Number(p.id),
      name: a.nickname || a.name || `Property ${p.id}`,
      listingName: a.name ?? null,
      type: a.type ?? null,
      bedrooms: Number.isFinite(Number(a.bedrooms)) ? Number(a.bedrooms) : null,
      maxGuests: a.maximum_capacity ?? null,
      currency: a.currency ?? null,
      createdAt: a.created_at ?? null,
      postcodeRaw: address.zip_code ?? null,
      city: address.city ?? null,
      lat: address.latitude ?? null,
      lng: address.longitude ?? null,
    };
  });
}

// ── Bookings ──────────────────────────────────────────────────────

const strip = (b) => Object.fromEntries(BOOKING_FIELDS.map((k) => [k, b[k] ?? null]));

/** All bookings for a property in [from, to], deduplicated across pages. */
async function loadBookings(propertyId, from, to, authHeader, maxPages = 50) {
  const byId = new Map();
  for (let page = 0; page < maxPages; page += 1) {
    const body = await get(`/bookings/${propertyId}?from=${from}&to=${to}&page=${page}&per_page=50`, authHeader, propertyId);
    const rows = Array.isArray(body?.bookings) ? body.bookings : [];
    let fresh = 0;
    for (const b of rows) {
      if (!byId.has(b.id)) {
        byId.set(b.id, strip(b));
        fresh += 1;
      }
    }
    const totalPages = Number(body?.meta?.total_pages ?? 0);
    // Pages are documented as 0-based; the fresh-row check also stops a 1-based API repeating page 1.
    if (fresh === 0 || page + 1 >= totalPages) break;
  }
  return [...byId.values()];
}

const isCancelled = (b) => String(b.status ?? '').toLowerCase() === 'cancelled';

function summarise(property, bookings, earlier, window) {
  const { start, end } = window; // day numbers, inclusive
  let revenue = 0;
  let cleaning = 0;
  let nights = 0;
  let zeroValueBookings = 0;
  let zeroValueNights = 0;
  let cancelledWithPayout = 0;
  let firstNight = null;
  let lastCheckOut = null;
  const channels = {};
  const currencies = new Set();
  const payoutCheck = { accommodation: 0, cleaning: 0, other: 0, commission: 0, payout: 0 };

  for (const b of bookings) {
    if (!b.check_in || !b.check_out) continue;
    const ci = toDay(b.check_in);
    const co = toDay(b.check_out);
    const stay = co - ci;
    const inWindow = Math.max(0, Math.min(co, end + 1) - Math.max(ci, start));
    if (stay <= 0 || inWindow === 0) continue;
    if (isCancelled(b)) {
      if (num(b.total_payout) > 0) cancelledWithPayout += 1;
      continue;
    }
    const accommodation = num(b.accomodation_total);
    if (accommodation <= 0) {
      zeroValueBookings += 1;
      zeroValueNights += inWindow;
      continue;
    }
    const share = inWindow / stay;
    revenue += accommodation * share;
    cleaning += num(b.cleaning_fee) * share;
    nights += inWindow;
    channels[b.channel ?? 'unknown'] = (channels[b.channel ?? 'unknown'] ?? 0) + inWindow;
    if (b.currency) currencies.add(b.currency);
    const firstIn = Math.max(ci, start);
    if (firstNight == null || firstIn < firstNight) firstNight = firstIn;
    if (lastCheckOut == null || co > lastCheckOut) lastCheckOut = co;
    payoutCheck.accommodation += accommodation;
    payoutCheck.cleaning += num(b.cleaning_fee);
    payoutCheck.other += num(b.other_charges);
    payoutCheck.commission += num(b.commission);
    payoutCheck.payout += num(b.total_payout);
  }

  const tradedBefore = earlier.some((b) => !isCancelled(b) && num(b.accomodation_total) > 0 && b.check_in && toDay(b.check_in) < start);
  const fullYear = tradedBefore;
  const liveSince = fullYear ? null : firstNight;
  const daysLive = fullYear ? 365 : liveSince == null ? 0 : end - liveSince + 1;
  const pc = normalisePostcode(property.postcodeRaw);
  const beds = property.bedrooms;
  const round = (v) => Math.round(v * 100) / 100;

  return {
    propertyId: property.id,
    name: property.name,
    type: property.type,
    city: property.city,
    postcode: pc?.formatted ?? null,
    postcodeRaw: property.postcodeRaw,
    bedrooms: beds,
    guests: beds == null ? null : beds * 2 + 2,
    maxGuests: property.maxGuests,
    cacheKey: pc && beds != null ? `${pc.compact}_${beds}bed` : null,
    window: { from: fromDay(start), to: fromDay(end), nights: end - start + 1 },
    revenue: round(revenue),
    cleaning: round(cleaning),
    nights,
    occupancy365: round(nights / 365),
    adr: nights > 0 ? round(revenue / nights) : null,
    fullYear,
    liveSince: liveSince == null ? null : fromDay(liveSince),
    daysLive,
    occupancyLive: daysLive > 0 ? round(nights / daysLive) : null,
    revenueAnnualised: daysLive > 0 ? round((revenue * 365) / daysLive) : null,
    lastCheckOut: lastCheckOut == null ? null : fromDay(lastCheckOut),
    possiblyPaused: lastCheckOut == null || lastCheckOut < end - PAUSED_AFTER_DAYS,
    zeroValueBookings,
    zeroValueNights,
    cancelledWithPayout,
    channels,
    currencies: [...currencies],
    payoutCheck: Object.fromEntries(Object.entries(payoutCheck).map(([k, v]) => [k, round(v)])),
    bookingsInWindow: bookings.length,
    uplistingCreatedAt: property.createdAt,
  };
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.UPLISTING_API_KEY;
  if (!apiKey) throw new Error('UPLISTING_API_KEY is not set');
  const authHeader = `Basic ${Buffer.from(apiKey.trim()).toString('base64')}`;

  const endIso = arg('--end') ?? fromDay(Math.floor(Date.now() / DAY) - 1);
  const end = toDay(endIso);
  const start = end - 364;
  const window = { start, end };
  const fetchFrom = fromDay(start - LOOKBACK_DAYS);
  const fetchTo = fromDay(end + 1);

  const me = await get('/users/me', authHeader);
  console.log(`Uplisting account: ${me?.name ?? '(unnamed)'}. Window: ${fromDay(start)} → ${fromDay(end)} (365 nights).`);

  const properties = await loadProperties(authHeader);
  console.log(`${properties.length} properties.`);
  mkdirSync(join(OUT_DIR, 'bookings'), { recursive: true });

  const results = [];
  const failures = [];
  const queue = [...properties];
  async function worker() {
    while (queue.length > 0) {
      const property = queue.shift();
      try {
        const bookings = await loadBookings(property.id, fetchFrom, fetchTo, authHeader);
        const earlier = await loadBookings(property.id, '2015-01-01', fromDay(start - 1), authHeader, 3);
        writeFileSync(join(OUT_DIR, 'bookings', `${property.id}.json`), JSON.stringify({ property, window: { from: fetchFrom, to: fetchTo }, bookings }));
        const s = summarise(property, bookings, earlier, window);
        results.push(s);
        console.log(`  ${s.name}: £${Math.round(s.revenue).toLocaleString('en-GB')} accommodation, ${s.nights} nights, ${s.cacheKey ?? 'no cache key'}${s.fullYear ? '' : ` (live since ${s.liveSince ?? '—'})`}`);
      } catch (err) {
        failures.push({ propertyId: property.id, name: property.name, error: err.message });
        console.log(`  fail ${property.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));

  results.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    join(OUT_DIR, 'actuals.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), account: me?.name ?? null, window: { from: fromDay(start), to: fromDay(end) }, properties: results, failures }, null, 1),
  );
  console.log(`\nSaved ${results.length} properties (${failures.length} failed) to ${join(OUT_DIR, 'actuals.json')}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
