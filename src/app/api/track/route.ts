// ─── Session Tracking Endpoint ────────────────────────────────────
// Receives session analytics data from the client-side tracker.
// Currently logs to console. Will push to Monday.com when configured.

const sessions: Record<string, unknown>[] = [];

export async function POST(request: Request) {
  try {
    const data = await request.json();

    console.log(
      "Session tracked:",
      data.sessionId,
      `${data.engagementScore}/100`,
      `${data.totalTimeSeconds}s`,
      `scroll:${data.scrollDepthPercent}%`,
      `sections:${data.sectionsViewed?.length ?? 0}`,
      `ctas:${data.ctaClicks?.length ?? 0}`
    );

    // Store in memory (resets on server restart)
    sessions.push(data);

    // Keep only last 200 in memory
    while (sessions.length > 200) {
      sessions.shift();
    }

    // TODO: Push to Monday.com when API key is configured

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
}
