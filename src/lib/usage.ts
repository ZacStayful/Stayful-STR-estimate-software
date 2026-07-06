// ─── Analyser Usage Gate (per-browser) ────────────────────────────
// Limits how many free estimates each BROWSER (device) can run, regardless of
// which email is entered. After the free limit the analyser stops producing
// estimates and the user is pushed to the paid product at
// intelligence.stayful.co.uk. One email is always exempt (the owner) —
// configurable via ANALYSER_UNLIMITED_EMAILS.
//
// Why per-browser and not per-email/server:
//   • Per-email was trivially bypassed — enter a new email, get another 2.
//   • There is no shared datastore, and a serverless in-memory count resets on
//     every cold-start/redeploy, so the server cannot be the source of truth.
//   • The browser's localStorage is the natural per-device counter. The client
//     reports its running count on each request; the server validates it, and
//     returns the incremented count for the client to persist.
// This is therefore a SOFT gate: clearing browser storage (or a fresh
// incognito window) resets the count. That is an accepted limitation of gating
// a lead funnel without accounts. To harden it, back the count with a device
// cookie or a durable per-lead store.

// Number of free estimates allowed per browser before the paywall kicks in.
// "2 free" ⇒ runs 1 and 2 are free, the 3rd is blocked.
export const FREE_ANALYSIS_LIMIT = 2;

// Where blocked users are sent to keep using the analyser.
export const PAYMENT_URL = "https://intelligence.stayful.co.uk";

// Emails that are never gated. Defaults to the owner; override with a
// comma-separated ANALYSER_UNLIMITED_EMAILS env var if needed.
const UNLIMITED_EMAILS: Set<string> = new Set(
  (process.env.ANALYSER_UNLIMITED_EMAILS ?? "zac@stayful.co.uk")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUnlimited(email: string | null | undefined): boolean {
  return !!email && UNLIMITED_EMAILS.has(normaliseEmail(email));
}

/** Coerce a client-reported browser count to a safe non-negative integer. */
function safeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Whether this browser has exhausted its free estimates and must pay.
 * `browserUses` is the count the browser reports from localStorage. The owner
 * email is always exempt (so testing never trips the gate).
 */
export function isBrowserBlocked(email: string | null | undefined, browserUses: unknown): boolean {
  if (isUnlimited(email)) return false;
  return safeCount(browserUses) >= FREE_ANALYSIS_LIMIT;
}

/**
 * The browser's new usage count after this analysis, for the client to persist.
 * The owner never increments (returns 0, which the client merges with max() so
 * it never lowers an existing count).
 */
export function nextBrowserCount(email: string | null | undefined, browserUses: unknown): number {
  if (isUnlimited(email)) return 0;
  return safeCount(browserUses) + 1;
}
