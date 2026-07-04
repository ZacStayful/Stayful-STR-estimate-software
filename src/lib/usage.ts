// ─── Analyser Usage Gate ──────────────────────────────────────────
// Limits how many free estimates each email address can run. After the
// free limit is reached the analyser stops producing estimates and the user
// is pushed to the paid product at intelligence.stayful.co.uk. One email is
// always exempt (the owner) — configurable via ANALYSER_UNLIMITED_EMAILS.
//
// Persistence model (no database is wired up in this project):
//   • Server-side in-memory Map — authoritative backstop, but per-instance and
//     reset on redeploy/cold-start (same trade-off as the rate limiter in
//     /api/analyse and the session store in /api/track).
//   • The client also keeps a per-email count in localStorage and reports it on
//     every request; the server merges the two with max() so the limit survives
//     serverless cold-starts and redeploys on a per-browser basis without any
//     new infrastructure.
// This is therefore a SOFT paywall: a determined user who clears their browser
// storage can reset their own count. That is an accepted limitation of gating
// without a shared datastore. To make it hard, back getUsageCount/recordUsage
// with a durable store (Vercel KV, a Monday column, etc.).

// Number of free estimates allowed per email before the paywall kicks in.
// "Used more than 2 times" ⇒ uses 1 and 2 are free, the 3rd is blocked.
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

// email (normalised) -> count of estimates produced
const usageMap = new Map<string, number>();

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUnlimited(email: string): boolean {
  return UNLIMITED_EMAILS.has(normaliseEmail(email));
}

/**
 * Merge a client-reported prior count (from localStorage) into the server
 * store. Never lowers the stored count — this is what lets the soft limit
 * survive instance restarts. Returns the reconciled count.
 */
export function reconcileClientCount(email: string, clientCount: unknown): number {
  const key = normaliseEmail(email);
  const raw = Number(clientCount);
  const safe = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const merged = Math.max(usageMap.get(key) ?? 0, safe);
  usageMap.set(key, merged);
  return merged;
}

/** Current known usage count for an email (server + any reconciled client hint). */
export function getUsageCount(email: string): number {
  return usageMap.get(normaliseEmail(email)) ?? 0;
}

/**
 * Whether this email has exhausted its free estimates and must pay. Reconciles
 * the client-reported count first so a redeploy doesn't hand out free runs.
 */
export function isBlocked(email: string, clientCount: unknown = 0): boolean {
  if (isUnlimited(email)) return false;
  return reconcileClientCount(email, clientCount) >= FREE_ANALYSIS_LIMIT;
}

/** Record that an estimate was produced for this email. Returns the new count. */
export function recordUsage(email: string): number {
  if (isUnlimited(email)) return 0;
  const key = normaliseEmail(email);
  const next = (usageMap.get(key) ?? 0) + 1;
  usageMap.set(key, next);
  return next;
}
