import { NextResponse } from "next/server";
import { canAccess } from "./access";
import { ensureProfile } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

export type GateResult =
  | { ok: true; profile: Profile }
  | { ok: false; response: NextResponse };

/**
 * Gate for paid-feature API routes (e.g. /api/analyse, /api/generate-pdf).
 * Either yields the profile, or a NextResponse the route handler must return.
 *
 *   401 unauthorized      — no Supabase session
 *   402 payment_required  — trial expired, no active subscription
 */
export async function requireFullAccess(): Promise<GateResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const profile = await ensureProfile(user.id, user.email ?? null);
  if (!canAccess(profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "trial_expired", message: "Your trial has ended. Please subscribe to continue." },
        { status: 402 },
      ),
    };
  }

  return { ok: true, profile };
}
