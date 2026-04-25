import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import { createSupabaseAdminClient } from "@/lib/intel/supabase/admin";
import { getStripe } from "@/lib/intel/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cancels any active subscription, then deletes the auth user (which cascades
 * the profile + saved_searches via FK on delete cascade).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
    } catch (err) {
      console.warn("Stripe cancel during account delete failed", err);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
