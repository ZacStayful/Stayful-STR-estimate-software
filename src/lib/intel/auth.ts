import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import { TRIAL_DAYS } from "./access";
import type { Profile } from "./types";

/**
 * Resolves the authenticated user + profile for the current request.
 * Redirects to /login (with redirect= back) if there is no session.
 *
 * Uses getUser() rather than getSession(): the latter is unverified and
 * shouldn't be trusted for authorisation.
 */
export async function requireUserAndProfile(redirectTo?: string): Promise<{
  userId: string;
  email: string | null;
  profile: Profile;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const target = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login";
    redirect(target);
  }

  const profile = await ensureProfile(user.id, user.email ?? null);
  return { userId: user.id, email: user.email ?? null, profile };
}

/**
 * Ensures the auth user has a corresponding profiles row. New profiles get
 * a 14-day trial window starting now. Idempotent.
 */
export async function ensureProfile(userId: string, email: string | null): Promise<Profile> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return existing as Profile;

  const now = new Date();
  const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      id: userId,
      email,
      plan: "free",
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
    })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create profile: ${error?.message ?? "unknown"}`);
  }
  return created as Profile;
}

export async function getOptionalUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
