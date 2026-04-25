import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import { createSupabaseAdminClient } from "@/lib/intel/supabase/admin";
import { ensureProfile } from "@/lib/intel/auth";
import { getProPriceId, getStripe } from "@/lib/intel/stripe";
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
  const stripe = getStripe();

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    const admin = createSupabaseAdminClient();
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const baseUrl = publicAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getProPriceId(), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/account?upgraded=true`,
    cancel_url: `${baseUrl}/upgrade?cancelled=true`,
    client_reference_id: user.id,
    subscription_data: { metadata: { supabase_user_id: user.id } },
    metadata: { supabase_user_id: user.id },
  });

  if (!session.url) {
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
