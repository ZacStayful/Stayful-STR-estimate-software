/**
 * UK postcode helpers. The estimate API takes a single address string —
 * we extract a postcode for the analysis pipeline that needs it explicitly.
 */

const UK_POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i;

export function extractPostcode(address: string): string | null {
  const m = address.toUpperCase().match(UK_POSTCODE);
  if (!m) return null;
  return `${m[1]} ${m[2]}`.toUpperCase();
}

export function shortAddressLabel(address: string): string {
  const trimmed = address.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "...";
}
