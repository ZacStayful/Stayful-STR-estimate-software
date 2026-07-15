// ─── UK postcode helpers ──────────────────────────────────────────

// Matches a full UK postcode embedded anywhere in a string and captures
// the outward-code letter prefix (the "postcode area") separately from
// the trailing digits. Validated against the Monday.com leads dataset.
//
//   group 1 → area letters   (e.g. "NG", "M", "E", "LE")
//   group 2 → the rest of the outward code (digits + optional letter)
//
// Examples of what it matches: "NG1 5GB", "M1 1AE", "E11 3LQ", "EC1A 1BB".
const UK_POSTCODE_RE = /\b([A-Z]{1,2})(\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/i;

/**
 * Extract the postcode area (the leading letter group of the outward code)
 * from a full UK postcode or an address that contains one.
 *
 * @returns the uppercased area letters (e.g. "NG", "M", "LE"), or `null`
 *          when no full UK postcode can be found in the input.
 */
export function extractPostcodeArea(postcodeOrAddress: string): string | null {
  if (typeof postcodeOrAddress !== 'string') return null;

  const match = postcodeOrAddress.match(UK_POSTCODE_RE);
  if (!match) return null;

  return match[1].toUpperCase();
}
