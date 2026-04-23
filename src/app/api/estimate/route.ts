import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import { createSupabaseAdminClient } from "@/lib/intel/supabase/admin";
import { ensureProfile } from "@/lib/intel/auth";
import { canSearch, FREE_SEARCH_LIMIT, searchesRemaining } from "@/lib/intel/search-limits";
import { runEstimate, type EstimateAdapterError } from "@/lib/intel/estimate-adapter";
import type { EstimateResponse } from "@/lib/intel/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  address?: unknown;
  guestCount?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const guestCount = Number(body.guestCount);

  if (!address) {
    return NextResponse.json({ error: "address_required" }, { status: 400 });
  }
  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 16) {
    return NextResponse.json({ error: "invalid_guest_count" }, { status: 400 });
  }

  const profile = await ensureProfile(user.id, user.email ?? null);

  if (!canSearch(profile)) {
    return NextResponse.json(
      {
        error: "free_limit_reached",
        plan: profile.plan,
        searchesUsed: profile.searches_used,
        searchesRemaining: 0,
        limit: FREE_SEARCH_LIMIT,
      },
      { status: 402 },
    );
  }

  let result;
  try {
    result = await runEstimate({ address, guestCount });
  } catch (error) {
    const e = error as Partial<EstimateAdapterError>;
    if (e?.code) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status ?? 500 });
    }
    console.error("Estimate failed:", error);
    return NextResponse.json(
      { error: "internal", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  // Increment via service role so RLS can't block us; users can only update
  // their own row, but the integer increment is safer when done atomically.
  const admin = createSupabaseAdminClient();
  const newCount = profile.searches_used + 1;
  const { data: updated } = await admin
    .from("profiles")
    .update({ searches_used: newCount })
    .eq("id", user.id)
    .select("searches_used, plan")
    .single();

  const after = updated ?? { searches_used: newCount, plan: profile.plan };

  const response: EstimateResponse = {
    ...result,
    searchesUsed: after.searches_used,
    searchesRemaining: searchesRemaining(after as typeof profile),
    plan: after.plan as typeof profile.plan,
  };

  return NextResponse.json(response);
}
