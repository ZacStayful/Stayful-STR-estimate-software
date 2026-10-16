// ─── "Access your report" lookup ──────────────────────────────────
//
// Backs /report (app/api/get-report): a landlord gives their email and gets a
// link to the PDF the analyser already uploaded to their Monday item.
//
// Fixed 2026-10-16 (website build plan, wave 1 fixes re-review), as the
// guaranteed rent calculator already was when it was forked from this one:
//   • the submitted email was pasted straight into the GraphQL string, so a
//     quote in the input rewrote the query; it is now a query variable;
//   • it read the "Call recordings" column rather than the column the analyser
//     uploads reports to;
//   • it read process.env.MONDAY_API_KEY! at module scope, which asserts a
//     value that may not be there.
// It now shares the board and column configuration with the rest of the
// integration, and only answers for an exact (case-insensitive) email match:
// Monday's contains_text would also match part of an address.
//
// Kept out of the route file so it can be tested without Next's runtime.

import { reportLookupConfig } from './monday.ts';

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

const LOOKUP_QUERY = `
  query ($boardId: ID!, $emailColumnId: ID!, $email: String!, $cols: [String!]) {
    boards(ids: [$boardId]) {
      items_page(
        limit: 10,
        query_params: {
          rules: [{ column_id: $emailColumnId, compare_value: [$email], operator: contains_text }]
        }
      ) {
        items {
          id
          name
          column_values(ids: $cols) { id value text }
        }
      }
    }
  }
`;

interface MondayColumnValue {
  id: string;
  value: string | null;
  text: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

export interface ReportLookupResult {
  status: number;
  body: Record<string, unknown>;
}

const reply = (status: number, body: Record<string, unknown>): ReportLookupResult => ({ status, body });

export async function lookupReport(email: unknown): Promise<ReportLookupResult> {
  if (typeof email !== "string" || !email.trim()) {
    return reply(400, { error: "Email is required" });
  }
  const wanted = email.toLowerCase().trim();

  const cfg = reportLookupConfig();
  if (!cfg) {
    console.error("[get-report] Monday credential not configured");
    return reply(503, { error: "Report lookup is unavailable right now." });
  }

  try {
    const mondayRes = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Version": MONDAY_API_VERSION,
        Authorization: cfg.token,
      },
      body: JSON.stringify({
        query: LOOKUP_QUERY,
        variables: {
          boardId: cfg.boardId,
          emailColumnId: cfg.emailColumnId,
          email: wanted,
          cols: [cfg.fileColumnId, cfg.emailColumnId],
        },
      }),
      cache: "no-store",
    });

    const mondayData = await mondayRes.json();
    if (mondayData?.errors) {
      console.error("[get-report] Monday returned errors:", mondayData.errors);
      return reply(502, { error: "Failed to fetch report. Please try again." });
    }

    // contains_text is a substring match; keep only the lead whose email is
    // exactly the one typed, so part of an address never finds someone else.
    const items: MondayItem[] = mondayData?.data?.boards?.[0]?.items_page?.items ?? [];
    const item = items.find((candidate) =>
      candidate.column_values.some(
        (c) => c.id === cfg.emailColumnId && (c.text ?? "").toLowerCase().trim() === wanted,
      ),
    );
    if (!item) {
      return reply(404, { error: "No lead found with that email address." });
    }

    const fileColumn = item.column_values.find((c) => c.id === cfg.fileColumnId);
    if (!fileColumn?.value) {
      return reply(404, { error: "No report has been generated for this lead yet. Please contact Stayful." });
    }

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    try {
      const parsed = JSON.parse(fileColumn.value);
      const files = parsed?.files ?? [];
      if (files.length > 0) {
        // Newest upload wins — a re-run appends rather than replacing.
        fileUrl = files[files.length - 1]?.url ?? null;
        fileName = files[files.length - 1]?.name ?? "Stayful-Analyser.pdf";
      }
    } catch {
      return reply(500, { error: "Could not parse report file." });
    }

    if (!fileUrl) {
      return reply(404, { error: "No report file found for this lead." });
    }

    return reply(200, { success: true, leadName: item.name, fileUrl, fileName });
  } catch (err) {
    console.error("[get-report] Monday API error:", err);
    return reply(500, { error: "Failed to fetch report. Please try again." });
  }
}
