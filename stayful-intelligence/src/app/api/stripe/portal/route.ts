import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import { ensureProfile } from "@/lib/intel/auth";
import { getStripe } from "@/lib/intel/stripe";
import { publicAppUrl } from "@/lib/intel/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await ensureProfile(user.id, user.email ?? null);
  if (!profile.stripe_customer_id) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${publicAppUrl()}/account`,
  });

  return NextResponse.json({ url: session.url });
}
