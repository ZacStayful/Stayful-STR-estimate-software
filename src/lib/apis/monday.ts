/**
 * Monday.com CRM integration — Management Leads board.
 *
 * Finds a lead in Monday.com by email (case-insensitive) and writes the
 * computed long-term let net annual and short-term let net annual figures
 * to the board columns.
 *
 * Required env vars (all must be set for sync to run):
 *   MONDAY_API_TOKEN              — personal API token (keep secret)
 *   MONDAY_BOARD_ID               — "Management Leads" board id
 *   MONDAY_EMAIL_COLUMN_ID        — column id holding lead emails
 *   MONDAY_LONG_TERM_LET_COLUMN_ID
 *   MONDAY_DEAL_ANALYSER_COLUMN_ID
 *
 * Behaviour: silent — all errors log server-side and are swallowed so the
 * caller (the analyse endpoint) never leaks CRM failures to the user.
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

function envConfig() {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  const emailColumnId = process.env.MONDAY_EMAIL_COLUMN_ID;
  const longTermColumnId = process.env.MONDAY_LONG_TERM_LET_COLUMN_ID;
  const dealAnalyserColumnId = process.env.MONDAY_DEAL_ANALYSER_COLUMN_ID;
  if (!token || !boardId || !emailColumnId || !longTermColumnId || !dealAnalyserColumnId) {
    return null;
  }
  return { token, boardId, emailColumnId, longTermColumnId, dealAnalyserColumnId };
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
    email: email.toLowerCase(),
  });
  const item = data?.items_page_by_column_values?.items?.[0];
  return item?.id ?? null;
}

/**
 * Updates the two money-tracking columns on a given item.
 */
async function updateItemColumns(
  token: string,
  boardId: string,
  itemId: string,
  columnValues: Record<string, number>,
): Promise<boolean> {
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
  const valuesJson = JSON.stringify(columnValues);
  const data = await mondayQuery<{ change_multiple_column_values: { id: string } }>(
    token,
    mutation,
    { boardId, itemId, values: valuesJson },
  );
  return Boolean(data?.change_multiple_column_values?.id);
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
): Promise<void> {
  const cfg = envConfig();
  if (!cfg) {
    console.log("[Monday] Sync skipped — env vars not configured");
    return;
  }
  if (!email || !email.includes("@")) {
    console.log("[Monday] Sync skipped — invalid email");
    return;
  }

  const itemId = await findItemIdByEmail(cfg.token, cfg.boardId, cfg.emailColumnId, email);
  if (!itemId) {
    console.log(`[Monday] No lead found for email (sync skipped): ${email}`);
    return;
  }

  const columnValues: Record<string, number> = {
    [cfg.longTermColumnId]: Math.round(longTermLetNetAnnual),
    [cfg.dealAnalyserColumnId]: Math.round(stayfulNetRevenue),
  };

  const ok = await updateItemColumns(cfg.token, cfg.boardId, itemId, columnValues);
  if (ok) {
    console.log(`[Monday] Synced analysis for ${email} → item ${itemId}`);
  } else {
    console.error(`[Monday] Column update failed for ${email} (item ${itemId})`);
  }
}
