// ─── Property type for leads that never used the public form ─────────
//
// Used by /api/internal/analyse-lead. Most reliable source first:
//   1. The address itself says it is a flat ("Flat 4", "Apartment 12"…).
//   2. The EPC register (looked up by the route; see lib/apis/epc.ts).
//   3. A type the caller supplies (n8n's best guess from address + bedrooms).
//   4. Default: 'Flat' — the calculator's existing default.

export const PROPERTY_TYPES = ['Flat', 'Terraced', 'Semi-detached', 'Detached'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyTypeSource = 'address' | 'epc' | 'caller' | 'default';

const FLAT_WORDS = /\b(flat|apartment|apt|unit|maisonette|penthouse|studio)\b/i;

/** True when the address alone settles it, so the EPC lookup can be skipped. */
export function addressSaysFlat(address: string): boolean {
  return FLAT_WORDS.test(address);
}

export function resolvePropertyType(
  address: string,
  supplied: unknown,
  epcType: PropertyType | null = null,
): { type: PropertyType; source: PropertyTypeSource } {
  if (addressSaysFlat(address)) return { type: 'Flat', source: 'address' };
  if (epcType) return { type: epcType, source: 'epc' };
  if (typeof supplied === 'string') {
    const wanted = supplied.trim().toLowerCase().replace(/[\s_]+/g, '-');
    const match = PROPERTY_TYPES.find((t) => t.toLowerCase() === wanted);
    if (match) return { type: match, source: 'caller' };
  }
  return { type: 'Flat', source: 'default' };
}
