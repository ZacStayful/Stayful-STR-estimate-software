/**
 * Monday.com CRM integration — Management Leads board.
 *
 * Finds a lead in Monday.com by email (case-insensitive) and writes the
 * computed long-term let net annual and short-term let net annual figures
 * to the board columns.
 *
 * Required env vars (all must be set for sync to run):
 *   MONDAY_API_KEY (or MONDAY_API_TOKEN) — API token (keep secret)
 *   MONDAY_BOARD_ID               — "Management Leads" board id
 *   MONDAY_EMAIL_COLUMN_ID        — column id holding lead emails
 *   MONDAY_LONG_TERM_LET_COLUMN_ID
 *   MONDAY_DEAL_ANALYSER_COLUMN_ID
 *
 * Behaviour: silent — all errors log server-side and are swallowed so the
 * caller (the analyse endpoint) never leaks CRM failures to the user.
 */

import { getLeadQualification, type LeadQualification } from "../analysis";
import {
  resolveLeadFromCandidates,
  type CandidateSets,
  type LeadCandidate,
  type LeadRef,
} from "./lead-match.ts";
import { normaliseUkPhone, ukPhoneSearchVariants } from "../utils/phone.ts";

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

// Management Leads board + its column IDs, hardcoded as defaults so the
// integration works with only MONDAY_API_TOKEN set. Env vars still override
// each value if you ever need to point at a different board or columns.
const DEFAULTS = {
  boardId: "5891626711",
  emailColumnId: "text_mkygb5xx",
  addressColumnId: "text6",                 // "Address" — property the lead enquired about
  phoneColumnId: "phone_mm1hp0a8",          // "Phone" — stored as typed (+44…, 44…, 07…)
  altPhoneColumnId: "text_mm1jzzzc",        // "Text Number format" — usually already "07…"
  longTermColumnId: "text_mm2dsnw7",
  dealAnalyserColumnId: "text_mm2dkavd",
  fileColumnId: "files__1",
  analyserUsesColumnId: "numeric_mm5221b0", // "Analyser Uses" — usage-gate counter
  timeOnSiteColumnId: "text_mm1ysvmg",
  // Qualification decision columns
  strProfitColumnId: "text_mm2eawgk",       // "STR Profit" — true uplift figure
  recommendationColumnId: "color_mm4tkwqv", // "Recommendation" status (Short-Let / Long-Let)
  qualifiedColumnId: "color_mm4t61wc",      // "Qualified" status (uplift band)
  statusColumnId: "status5",                // main "Status" column
};

// Status columns are written by their numeric label id ("index"), NOT by label
// text, so renaming a label on the board can never break the sync (a single bad
// label rejects the whole atomic multi-column write). Ids verified on the board.
const RECOMMENDATION_INDEX: Record<string, number> = {
  SHORT_LET: 1, // color_mm4tkwqv id 1 = "Short-Let"
  LONG_LET: 2,  // id 2 = "Long-Let"
};

const QUALIFIED_INDEX: Record<LeadQualification, number> = {
  medium: 0,      // color_mm4t61wc id 0 = "Medium (30%)"
  qualified: 1,   // id 1 = "Qualified (50%)"
  unqualified: 2, // id 2 = "unqualified (-30%)"
};

// status5 id 2 = "Abandoned" — where an unqualified lead is moved.
const ABANDONED_STATUS_INDEX = 2;

function envConfig() {
  // Accept either env var name. This project deploys with MONDAY_API_KEY (the
  // get-report route uses it too); MONDAY_API_TOKEN is supported for back-compat.
  const token = process.env.MONDAY_API_TOKEN || process.env.MONDAY_API_KEY;
  if (!token) {
    console.log("[Monday] No API credential set (MONDAY_API_KEY / MONDAY_API_TOKEN)");
    return null;
  }
  return {
    token,
    boardId: process.env.MONDAY_BOARD_ID || DEFAULTS.boardId,
    emailColumnId: process.env.MONDAY_EMAIL_COLUMN_ID || DEFAULTS.emailColumnId,
    addressColumnId: process.env.MONDAY_ADDRESS_COLUMN_ID || DEFAULTS.addressColumnId,
    phoneColumnId: process.env.MONDAY_PHONE_COLUMN_ID || DEFAULTS.phoneColumnId,
    altPhoneColumnId: process.env.MONDAY_ALT_PHONE_COLUMN_ID || DEFAULTS.altPhoneColumnId,
    longTermColumnId: process.env.MONDAY_LONG_TERM_LET_COLUMN_ID || DEFAULTS.longTermColumnId,
    dealAnalyserColumnId: process.env.MONDAY_DEAL_ANALYSER_COLUMN_ID || DEFAULTS.dealAnalyserColumnId,
    strProfitColumnId: process.env.MONDAY_STR_PROFIT_COLUMN_ID || DEFAULTS.strProfitColumnId,
    recommendationColumnId: process.env.MONDAY_RECOMMENDATION_COLUMN_ID || DEFAULTS.recommendationColumnId,
    qualifiedColumnId: process.env.MONDAY_QUALIFIED_COLUMN_ID || DEFAULTS.qualifiedColumnId,
    statusColumnId: process.env.MONDAY_STATUS_COLUMN_ID || DEFAULTS.statusColumnId,
  };
}

async function mondayQuery<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "API-Version": MONDAY_API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      console.error(`[Monday] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      console.error("[Monday] GraphQL errors:", JSON.stringify(json.errors));
      return null;
    }
    return json.data ?? null;
  } catch (err) {
    console.error("[Monday] Network/parse error:", err);
    return null;
  }
}

/**
 * Finds the first item in the Management Leads board with a matching email.
 * Returns the item id or null.
 */
async function findItemIdByEmail(
  token: string,
  boardId: string,
  emailColumnId: string,
  email: string,
): Promise<string | null> {
  const query = `
    query ($boardId: ID!, $columnId: String!, $email: String!) {
      items_page_by_column_values(
        board_id: $boardId,
        columns: [{ column_id: $columnId, column_values: [$email] }],
        limit: 1
      ) {
        items { id }
      }
    }
  `;
  const data = await mondayQuery<{
    items_page_by_column_values: { items: Array<{ id: string }> };
  }>(token, query, {
    boardId,
    columnId: emailColumnId,
    email,
  });
  const item = data?.items_page_by_column_values?.items?.[0];
  if (item?.id) return item.id;

  // Fallback: try lowercase if original didn't match (handles case mismatches)
  const lower = email.toLowerCase();
  if (lower !== email) {
    const fallback = await mondayQuery<{
      items_page_by_column_values: { items: Array<{ id: string }> };
    }>(token, query, {
      boardId,
      columnId: emailColumnId,
      email: lower,
    });
    return fallback?.items_page_by_column_values?.items?.[0]?.id ?? null;
  }

  return null;
}

// ── Address / phone based lead matching ──────────────────────────
// Leads arrive on the board via the enquiry form, which stores the property
// address in the Address column (text6). A lead who then runs the analyser
// enters that same property address, so when the email doesn't resolve their
// row (they used a different email than the one on the board, or a typo) we can
// still find the right lead by the property they enquired about, or by their
// phone number. Matching is anchored on the postcode — the one part of a
// free-text UK address that survives spelling differences (see "Pevril" vs
// "Peveril") — with the house number as the tiebreaker, and it refuses to guess
// when the property is ambiguous, so an analysis is never written onto the
// wrong lead.
//
// The precedence logic itself lives in ./lead-match.ts as a pure function, so
// it can be unit-tested exhaustively and reused verbatim by the bulk upload's
// in-memory matcher. This module only does the I/O that builds its inputs.

// UK postcodes are stored inconsistently ("NG7 4AJ" vs "NG74AJ"); contains_text
// is a literal substring match, so search for the spaced and compact forms.
function postcodeVariants(postcode: string): string[] {
  const compact = postcode.toUpperCase().replace(/\s+/g, "");
  const variants = new Set<string>();
  const asEntered = postcode.trim().toUpperCase();
  if (asEntered) variants.add(asEntered);
  if (compact.length >= 5) variants.add(`${compact.slice(0, compact.length - 3)} ${compact.slice(-3)}`);
  if (compact) variants.add(compact);
  return [...variants];
}

type Cfg = NonNullable<ReturnType<typeof envConfig>>;

/** The column ids every candidate query needs to fetch. */
function candidateCols(cfg: Cfg): string[] {
  return [cfg.emailColumnId, cfg.addressColumnId, cfg.phoneColumnId, cfg.altPhoneColumnId];
}

function toCandidates(
  items: Array<{ id: string; name?: string; column_values: Array<{ id: string; text: string | null }> }>,
  cfg: Cfg,
): LeadCandidate[] {
  const col = (
    values: Array<{ id: string; text: string | null }>,
    id: string,
  ): string => values.find((c) => c.id === id)?.text ?? "";

  return items.map((it) => ({
    id: it.id,
    name: it.name,
    email: col(it.column_values, cfg.emailColumnId),
    address: col(it.column_values, cfg.addressColumnId),
    phone: col(it.column_values, cfg.phoneColumnId),
    altPhone: col(it.column_values, cfg.altPhoneColumnId),
  }));
}

type CandidateItems = { items: Array<{ id: string; name?: string; column_values: Array<{ id: string; text: string | null }> }> };

const BY_COLUMN_VALUES_QUERY = `
  query ($boardId: ID!, $columnId: String!, $values: [String]!, $cols: [String!]) {
    items_page_by_column_values(
      board_id: $boardId,
      columns: [{ column_id: $columnId, column_values: $values }],
      limit: 25
    ) {
      items { id name column_values(ids: $cols) { id text } }
    }
  }
`;

async function searchByColumnValues(
  cfg: Cfg, columnId: string, values: string[],
): Promise<LeadCandidate[]> {
  if (!values.length) return [];
  const data = await mondayQuery<{ items_page_by_column_values: CandidateItems }>(
    cfg.token, BY_COLUMN_VALUES_QUERY,
    { boardId: cfg.boardId, columnId, values, cols: candidateCols(cfg) },
  );
  const items = data?.items_page_by_column_values?.items ?? [];
  return items.length ? toCandidates(items, cfg) : [];
}

async function searchLeadsByEmail(cfg: Cfg, email: string): Promise<LeadCandidate[]> {
  // Case mismatches are common, so try the address as given and lowercased.
  const values = [...new Set([email, email.toLowerCase()])];
  return searchByColumnValues(cfg, cfg.emailColumnId, values);
}

/**
 * Find leads by phone number.
 *
 * The board stores the same mobile in six different shapes across the two
 * phone columns — "+4407896959558", "447456850528", "4407568428895",
 * "+447984670995", "07702618284" — so we search for every canonical spelling
 * rather than assuming one. The "Text Number format" column (text) is checked
 * first because it is already normalised to "07…" on ~92% of rows; the Phone
 * column is checked second and can hold a DIFFERENT number for the same lead.
 */
async function searchLeadsByPhone(cfg: Cfg, phone: string): Promise<LeadCandidate[]> {
  const parsed = normaliseUkPhone(phone);
  if (!parsed) return [];
  const variants = ukPhoneSearchVariants(parsed);

  const byText = await searchByColumnValues(cfg, cfg.altPhoneColumnId, variants);
  if (byText.length) return byText;
  return searchByColumnValues(cfg, cfg.phoneColumnId, variants);
}

async function searchLeadsByPostcode(cfg: Cfg, postcode: string): Promise<LeadCandidate[]> {
  const query = `
    query ($boardId: ID!, $qp: ItemsQuery!, $cols: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 25, query_params: $qp) {
          items { id name column_values(ids: $cols) { id text } }
        }
      }
    }
  `;
  for (const variant of postcodeVariants(postcode)) {
    const data = await mondayQuery<{ boards: Array<{ items_page: CandidateItems }> }>(
      cfg.token, query, {
        boardId: cfg.boardId,
        qp: { rules: [{ column_id: cfg.addressColumnId, compare_value: [variant], operator: "contains_text" }] },
        cols: candidateCols(cfg),
      },
    );
    const items = data?.boards?.[0]?.items_page?.items ?? [];
    if (items.length) return toCandidates(items, cfg);
  }
  return [];
}

/**
 * Resolve the Management Leads item for an analyser run. Email is the primary
 * key; when it doesn't resolve a single lead, fall back to the enquiry property
 * (postcode + house number) stored in the Address column. Returns the item id,
 * or null — it never guesses when the property is ambiguous.
 */
async function findLeadItemId(cfg: Cfg, ref: LeadRef): Promise<string | null> {
  const email = ref.email?.trim();
  const phone = ref.phone?.trim();
  const postcode = ref.postcode?.trim();

  // Three independent searches, run in parallel — each may return nothing.
  const [byEmail, byPhone, byPostcode] = await Promise.all([
    email && email.includes("@") ? searchLeadsByEmail(cfg, email) : Promise.resolve([]),
    phone ? searchLeadsByPhone(cfg, phone) : Promise.resolve([]),
    postcode ? searchLeadsByPostcode(cfg, postcode) : Promise.resolve([]),
  ]);

  const sets: CandidateSets = { byEmail, byPhone, byPostcode };
  return resolveLeadFromCandidates(sets, ref).itemId;
}

/**
 * Public wrapper: resolve the Management Leads item for a set of identifying
 * details, or null when it can't be determined without guessing.
 *
 * Exposed so the bulk upload can resolve — and show you — the match BEFORE any
 * money is spent, then pass the confirmed item id into the write functions
 * below. That also halves the number of lookups on the live path, which
 * previously resolved once for the column sync and again for the PDF upload.
 */
export async function resolveLeadItemId(ref: LeadRef): Promise<string | null> {
  const cfg = envConfig();
  if (!cfg) return null;
  const hasSignal = Boolean(ref.email?.includes("@") || ref.phone || ref.postcode);
  if (!hasSignal) return null;
  return findLeadItemId(cfg, ref);
}

/**
 * Updates the two money-tracking columns on a given item.
 */
async function updateItemColumns(
  token: string,
  boardId: string,
  itemId: string,
  columnValues: Record<string, string | number | { label: string } | { index: number } | null>,
): Promise<boolean> {
  const valuesJson = JSON.stringify(columnValues);

  // MONDAY_DRY_RUN=1 — log exactly what would be written and report success,
  // without touching the board. Lets a whole bulk job be rehearsed against the
  // REAL board (matching included, which is the part most worth testing on
  // real data) while mutating nothing.
  if (process.env.MONDAY_DRY_RUN === "1") {
    console.log(`[Monday][DRY RUN] would write to item ${itemId}: ${valuesJson}`);
    return true;
  }

  const mutation = `
    mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values(
        board_id: $boardId,
        item_id: $itemId,
        column_values: $values
      ) {
        id
      }
    }
  `;
  const data = await mondayQuery<{ change_multiple_column_values: { id: string } }>(
    token,
    mutation,
    { boardId, itemId, values: valuesJson },
  );
  return Boolean(data?.change_multiple_column_values?.id);
}

// ── Analyser usage counter ───────────────────────────────────────
// Durable per-email count of analyser runs, stored in the "Analyser Uses"
// number column on the lead's item. This backs the free-analysis paywall.
// It counts FORWARD from when the column was introduced (existing leads start
// at 0), so established leads are not retroactively blocked, and it is keyed by
// the lead — never by device — so it can't over-block a shared browser.

function analyserUsesColumnId(): string {
  return process.env.MONDAY_ANALYSER_USES_COLUMN_ID || DEFAULTS.analyserUsesColumnId;
}

async function readUseCount(
  cfg: NonNullable<ReturnType<typeof envConfig>>,
  itemId: string,
): Promise<number> {
  const colId = analyserUsesColumnId();
  const query = `
    query ($ids: [ID!], $cols: [String!]) {
      items(ids: $ids) { column_values(ids: $cols) { id text } }
    }
  `;
  const data = await mondayQuery<{
    items: Array<{ column_values: Array<{ id: string; text: string | null }> }>;
  }>(cfg.token, query, { ids: [itemId], cols: [colId] });
  const text = data?.items?.[0]?.column_values?.find((c) => c.id === colId)?.text ?? "";
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * How many analyser runs this email's lead has recorded. Returns 0 when Monday
 * isn't configured, the email isn't a known lead, or the column is empty — so
 * the usage gate fails open and never wrongly blocks a genuine new user.
 */
export async function getAnalyserUseCount(email: string): Promise<number> {
  const cfg = envConfig();
  if (!cfg) return 0;
  if (!email || !email.includes("@")) return 0;

  const itemId = await findItemIdByEmail(cfg.token, cfg.boardId, cfg.emailColumnId, email);
  if (!itemId) return 0;
  return readUseCount(cfg, itemId);
}

/**
 * Increment the analyser-use counter for this email's lead by one. No-op when
 * Monday isn't configured or the email isn't a known lead (nothing to count
 * against). Fails silently — a CRM hiccup must never break the analysis.
 */
export async function incrementAnalyserUseCount(email: string): Promise<void> {
  const cfg = envConfig();
  if (!cfg) return;
  if (!email || !email.includes("@")) return;

  const itemId = await findItemIdByEmail(cfg.token, cfg.boardId, cfg.emailColumnId, email);
  if (!itemId) {
    console.log(`[Monday] Analyser-use increment skipped — no lead for: ${email}`);
    return;
  }
  const current = await readUseCount(cfg, itemId);
  const ok = await updateItemColumns(cfg.token, cfg.boardId, itemId, {
    [analyserUsesColumnId()]: String(current + 1),
  });
  if (ok) {
    console.log(`[Monday] Analyser uses for ${email} → ${current + 1}`);
  } else {
    console.error(`[Monday] Analyser-use increment failed for ${email} (item ${itemId})`);
  }
}

/**
 * Fire-and-forget sync: find Monday item by email, then write the two figures.
 * Fails silently (logs only). Safe to call from within an SSE stream handler
 * without awaiting — though awaiting is fine too since errors are swallowed.
 */
export async function syncAnalysisToMonday(
  email: string,
  longTermLetNetAnnual: number,
  stayfulNetRevenue: number,
  recommendation?: {
    recommendation: string;
    trueSTRNet: number;
    trueLLNet: number;
    longLetMonthly: number;
    upliftPct: number;
  },
  property?: { address?: string | null; postcode?: string | null; phone?: string | null },
  /** Pre-resolved item id (bulk); skips the lookup when supplied. */
  knownItemId?: string | null,
): Promise<void> {
  const cfg = envConfig();
  if (!cfg) {
    console.log("[Monday] Sync skipped — env vars not configured");
    return;
  }
  const hasEmail = !!email && email.includes("@");
  if (!knownItemId && !hasEmail && !property?.postcode && !property?.phone) {
    console.log("[Monday] Sync skipped — no email, phone or postcode to match on");
    return;
  }

  const itemId = knownItemId
    ?? await findLeadItemId(cfg, {
      email,
      phone: property?.phone,
      address: property?.address,
      postcode: property?.postcode,
    });
  if (!itemId) {
    console.log(`[Monday] No lead found (sync skipped): email=${email} postcode=${property?.postcode ?? "?"}`);
    return;
  }

  // Text columns require string values in Monday's API
  const columnValues: Record<string, string | { label: string } | { index: number }> = {
    [cfg.longTermColumnId]: String(Math.round(longTermLetNetAnnual)),
    [cfg.dealAnalyserColumnId]: String(Math.round(stayfulNetRevenue)),
  };

  // Qualification decision write-back. Per spec:
  //  • Long term let column ← longLetMonthly × 12 (the figure the decision used)
  //  • STR Profit column    ← true uplift (trueSTRNet − trueLLNet), not the
  //                           inflated headline difference
  //  • Recommendation status ← Short-Let / Long-Let
  if (recommendation) {
    const recIndex = RECOMMENDATION_INDEX[recommendation.recommendation];
    columnValues[cfg.longTermColumnId] = String(Math.round(recommendation.longLetMonthly * 12));
    columnValues[cfg.strProfitColumnId] = String(Math.round(recommendation.trueSTRNet - recommendation.trueLLNet));
    if (recIndex !== undefined) {
      columnValues[cfg.recommendationColumnId] = { index: recIndex };
    }

    // Lead qualification band (test phase): ≥50% qualified, 30–50% medium,
    // <30% unqualified. Unqualified leads are also moved to status5 = Abandoned.
    const band: LeadQualification = getLeadQualification(recommendation.upliftPct);
    columnValues[cfg.qualifiedColumnId] = { index: QUALIFIED_INDEX[band] };
    if (band === "unqualified") {
      columnValues[cfg.statusColumnId] = { index: ABANDONED_STATUS_INDEX };
    }
  }

  const ok = await updateItemColumns(cfg.token, cfg.boardId, itemId, columnValues);
  if (ok) {
    console.log(`[Monday] Synced analysis for ${email} → item ${itemId}`);
  } else {
    console.error(`[Monday] Column update failed for ${email} (item ${itemId})`);
  }
}

/**
 * Uploads a PDF buffer to a Monday file column on the matched item.
 * Uses Monday's multipart file upload endpoint.
 */
export async function uploadPdfToMonday(
  email: string,
  pdfBuffer: Buffer | Uint8Array,
  filename: string,
  property?: { address?: string | null; postcode?: string | null; phone?: string | null },
  /** Pre-resolved item id (bulk); skips the lookup when supplied. */
  knownItemId?: string | null,
): Promise<void> {
  const cfg = envConfig();
  if (!cfg) return;
  const hasEmail = !!email && email.includes("@");
  if (!knownItemId && !hasEmail && !property?.postcode && !property?.phone) return;

  const itemId = knownItemId
    ?? await findLeadItemId(cfg, {
      email,
      phone: property?.phone,
      address: property?.address,
      postcode: property?.postcode,
    });
  if (!itemId) {
    console.log(`[Monday] PDF upload skipped — no lead for: email=${email} postcode=${property?.postcode ?? "?"}`);
    return;
  }

  const fileColumnId = process.env.MONDAY_FILE_COLUMN_ID || DEFAULTS.fileColumnId;

  if (process.env.MONDAY_DRY_RUN === "1") {
    console.log(
      `[Monday][DRY RUN] would upload ${filename} (${pdfBuffer.length} bytes) ` +
      `to item ${itemId} column ${fileColumnId}`,
    );
    return;
  }

  try {
    const query = `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${fileColumnId}", file: $file) { id } }`;

    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
    const form = new FormData();
    form.append("query", query);
    form.append("variables[file]", blob, filename);

    const res = await fetch("https://api.monday.com/v2/file", {
      method: "POST",
      headers: {
        Authorization: cfg.token,
        "API-Version": MONDAY_API_VERSION,
      },
      body: form,
    });

    if (!res.ok) {
      console.error(`[Monday] PDF upload HTTP ${res.status}: ${await res.text()}`);
      return;
    }
    console.log(`[Monday] PDF uploaded for ${email} → item ${itemId}`);
  } catch (err) {
    console.error("[Monday] PDF upload error:", err);
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/**
 * Pushes session duration to a text column in Monday.
 */
export async function syncTimeOnSiteToMonday(
  email: string,
  seconds: number,
): Promise<void> {
  const cfg = envConfig();
  if (!cfg) return;
  if (!email || !email.includes("@") || seconds <= 0) return;

  const itemId = await findItemIdByEmail(cfg.token, cfg.boardId, cfg.emailColumnId, email);
  if (!itemId) {
    console.log(`[Monday] Time sync skipped — no lead for: ${email}`);
    return;
  }

  const timeColumnId = process.env.MONDAY_TIME_ON_SITE_COLUMN_ID || DEFAULTS.timeOnSiteColumnId;
  const formatted = formatDuration(Math.round(seconds));

  const mutation = `
    mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }
  `;
  const valuesJson = JSON.stringify({ [timeColumnId]: formatted });
  const data = await mondayQuery<{ change_multiple_column_values: { id: string } }>(
    cfg.token,
    mutation,
    { boardId: cfg.boardId, itemId, values: valuesJson },
  );
  if (data?.change_multiple_column_values?.id) {
    console.log(`[Monday] Time synced for ${email}: ${formatted}`);
  } else {
    console.error(`[Monday] Time update failed for ${email}`);
  }
}
