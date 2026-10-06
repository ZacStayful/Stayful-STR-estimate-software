// ─── Property type for leads that never used the public form ─────────
//
// Used by /api/internal/analyse-lead. Most reliable source first:
//   1. The address itself says it is a flat ("Flat 4", "Apartment 12"…).
//   2. A type the caller supplies (n8n's best guess from address + bedrooms).
//   3. Default: 'Flat' — the calculator's existing default.

export const PROPERTY_TYPES = ['Flat', 'Terraced', 'Semi-detached', 'Detached'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyTypeSource = 'address' | 'caller' | 'default';

const FLAT_WORDS = /\b(flat|apartment|apt|unit|maisonette|penthouse|studio)\b/i;

export function resolvePropertyType(
  address: string,
  supplied: unknown,
): { type: PropertyType; source: PropertyTypeSource } {
  if (FLAT_WORDS.test(address)) return { type: 'Flat', source: 'address' };
  if (typeof supplied === 'string') {
    const wanted = supplied.trim().toLowerCase().replace(/[\s_]+/g, '-');
    const match = PROPERTY_TYPES.find((t) => t.toLowerCase() === wanted);
    if (match) return { type: match, source: 'caller' };
  }
  return { type: 'Flat', source: 'default' };
}
