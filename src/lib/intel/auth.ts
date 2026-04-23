import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { Profile } from "./types";

/**
 * Resolves the authenticated user + profile for the current request.
 * Redirects to /login if there is no session.
 *
 * Uses getUser() rather than getSession() because the latter is unverified.
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
 * Ensures the auth user has a corresponding `profiles` row. New signups always
 * get a fresh profile here so we never depend on a Supabase trigger being
 * configured in the user's project.
 */
export async function ensureProfile(userId: string, email: string | null): Promise<Profile> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return existing as Profile;

  const { data: created, error } = await admin
    .from("profiles")
    .insert({ id: userId, email, plan: "free", searches_used: 0 })
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
