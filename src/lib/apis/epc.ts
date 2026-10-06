/**
 * EPC register lookup — property type (flat / terraced / semi / detached).
 *
 * Service: "Get energy performance of buildings data" (MHCLG), the successor
 * to epc.opendatacommunities.org.
 *   GET {base}/api/domestic/search?postcode=…    → certificate index
 *   GET {base}/api/certificate?certificate_number=… → full certificate
 *
 * API key: EPC_API_KEY (a Bearer token; a value already starting with
 * "Bearer " is accepted too). Optional EPC_API_BASE_URL overrides the host.
 *
 * The certificate body is schema-free (it mirrors the lodged RdSAP/SAP
 * document), so property type and built form are found by key name anywhere
 * in it, and both the words ("Semi-Detached") and the numeric RdSAP codes are
 * understood.
 *
 * Like the other API modules here this must NEVER throw or block the
 * analysis: any failure, timeout, missing key or uncertain match returns null
 * and the caller falls back to its next source.
 */

import type { PropertyType } from '../pipeline/propertyType';

const DEFAULT_BASE = 'https://api.get-energy-performance-data.communities.gov.uk';
// Two calls at most, so the lookup never costs the analysis more than ~8s of its 60s ceiling.
const TIMEOUT_MS = 4000;

export interface EpcSearchRow {
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressLine4?: string | null;
  certificateNumber?: string;
  postcode?: string;
  registrationDate?: string;
}

export interface EpcLookupResult {
  type: PropertyType;
  certificateNumber: string;
  matchedAddress: string;
  rawPropertyType: string | null;
  rawBuiltForm: string | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The leading number / flat designator of an address ("Flat 4, 12 High St" → ["4","12"]). */
function addressNumbers(s: string): string[] {
  return (norm(s).match(/\b\d+[a-z]?\b/g) ?? []).filter((n) => n.length <= 5);
}

const STOP = new Set(['road', 'rd', 'street', 'st', 'lane', 'ln', 'avenue', 'ave', 'close', 'drive', 'way', 'the', 'flat', 'apartment', 'and']);
function addressWords(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((w) => w.length > 2 && !/^\d/.test(w) && !STOP.has(w)));
}

/**
 * Pick the certificate whose address is this property: every number in the
 * lead's street part must appear in the row, and at least one street word must
 * match. Several certificates for one home → the most recent wins. No
 * confident match → null (never guess a neighbour's house type).
 */
export function pickCertificate(leadAddress: string, postcode: string, rows: EpcSearchRow[]): EpcSearchRow | null {
  const pc = norm(postcode);
  const street = norm(leadAddress).replace(pc, ' ');
  const nums = addressNumbers(street);
  const words = addressWords(street);
  if (nums.length === 0 && words.size === 0) return null; // postcode only: no single property to match

  const rowAddr = (r: EpcSearchRow) =>
    norm([r.addressLine1, r.addressLine2, r.addressLine3, r.addressLine4].filter(Boolean).join(' '));
  const numberMatches = rows.filter((r) => {
    const rowNums = new Set(addressNumbers(rowAddr(r)));
    if (nums.length === 0 || !nums.every((n) => rowNums.has(n))) return false;
    // A row with MORE numbers than the lead (e.g. "Flat 2, 12 High St" vs lead "12 High St")
    // is a different dwelling in the same building.
    return rowNums.size <= nums.length;
  });
  const wordMatches = numberMatches.filter((r) => {
    const rowWords = addressWords(rowAddr(r));
    return words.size === 0 || [...words].some((w) => rowWords.has(w));
  });
  // Street words agree → use those. Otherwise accept the number match only when it is a
  // single home in the postcode (covers a misspelt street, e.g. "Glenegals" for "Gleneagles").
  let matches = wordMatches;
  if (matches.length === 0) {
    const homes = new Set(numberMatches.map(rowAddr));
    matches = homes.size === 1 ? numberMatches : [];
  }
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => String(b.registrationDate ?? '').localeCompare(String(a.registrationDate ?? '')))[0];
}

/** Find the first value whose key, ignoring case and separators, equals one of `keys`. */
export function findField(obj: unknown, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  const want = new Set(keys.map((k) => k.toLowerCase().replace(/[^a-z]/g, '')));
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (want.has(k.toLowerCase().replace(/[^a-z]/g, '')) && (typeof v === 'string' || typeof v === 'number')) {
      return String(v).trim();
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const hit = findField(v, keys, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Map the register's values to the calculator's four types.
 * RdSAP codes — property type: 0 House, 1 Bungalow, 2 Flat, 3 Maisonette, 4 Park home;
 * built form: 1 Detached, 2 Semi-Detached, 3 End-Terrace, 4 Mid-Terrace,
 * 5 Enclosed End-Terrace, 6 Enclosed Mid-Terrace.
 */
export function mapEpcType(propertyType: string | null, builtForm: string | null): PropertyType | null {
  const pt = (propertyType ?? '').toLowerCase();
  if (pt === '2' || pt === '3' || /flat|maisonette/.test(pt)) return 'Flat';
  const bfRaw = (builtForm ?? '').toLowerCase();
  // Some certificates only describe the dwelling ("Semi-detached house") in the type field.
  const bf = bfRaw || pt;
  if (bfRaw === '1' || (/detached/.test(bf) && !/semi/.test(bf))) return 'Detached';
  if (bfRaw === '2' || /semi/.test(bf)) return 'Semi-detached';
  if (['3', '4', '5', '6'].includes(bfRaw) || /terrace/.test(bf)) return 'Terraced';
  return null;
}

function authHeader(): string | null {
  const raw = (process.env.EPC_API_KEY ?? '').trim();
  if (!raw) return null;
  return /^bearer\s+/i.test(raw) ? raw : `Bearer ${raw}`;
}

async function getJson(fetchImpl: FetchLike, url: string, auth: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: auth, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[EPC] ${res.status} for ${url.split('?')[0]}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[EPC] request failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupEpcPropertyType(
  address: string,
  postcode: string,
  fetchImpl: FetchLike = fetch,
): Promise<EpcLookupResult | null> {
  const auth = authHeader();
  if (!auth || !postcode) return null;
  const base = (process.env.EPC_API_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');

  const search = (await getJson(
    fetchImpl,
    `${base}/api/domestic/search?postcode=${encodeURIComponent(postcode)}&page_size=500`,
    auth,
  )) as { data?: EpcSearchRow[] } | null;
  const row = pickCertificate(address, postcode, search?.data ?? []);
  if (!row?.certificateNumber) return null;

  const cert = await getJson(
    fetchImpl,
    `${base}/api/certificate?certificate_number=${encodeURIComponent(row.certificateNumber)}`,
    auth,
  );
  if (!cert) return null;
  const rawPropertyType = findField(cert, ['property_type', 'propertyType', 'dwelling_type']);
  const rawBuiltForm = findField(cert, ['built_form', 'builtForm']);
  const type = mapEpcType(rawPropertyType, rawBuiltForm);
  if (!type) return null;

  return {
    type,
    certificateNumber: row.certificateNumber,
    matchedAddress: [row.addressLine1, row.addressLine2, row.addressLine3, row.addressLine4].filter(Boolean).join(', '),
    rawPropertyType,
    rawBuiltForm,
  };
}
