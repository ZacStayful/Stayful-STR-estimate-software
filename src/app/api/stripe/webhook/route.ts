import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/intel/stripe";
import { createSupabaseAdminClient } from "@/lib/intel/supabase/admin";
import { requireServerEnv } from "@/lib/intel/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook receiver. Verifies the signature with `STRIPE_WEBHOOK_SECRET`,
 * then keeps `profiles.plan` and the subscription metadata in sync.
 *
 * The proxy.ts matcher excludes /api/stripe/webhook so the raw body reaches
 * us unmodified — Stripe's signature check requires byte-perfect bodies.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const secret = requireServerEnv("STRIPE_WEBHOOK_SECRET");
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `signature_invalid: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.client_reference_id as string | null) ??
          (session.metadata?.supabase_user_id as string | undefined);
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        if (userId) {
          await admin
            .from("profiles")
            .update({
              plan: "pro",
              stripe_customer_id: customerId ?? undefined,
              stripe_subscription_id: subscriptionId ?? undefined,
              stripe_subscription_status: "active",
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscriptionToProfile(admin, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(sub);
        if (userId) {
          await admin
            .from("profiles")
            .update({
              plan: "free",
              stripe_subscription_id: null,
              stripe_subscription_status: "canceled",
            })
            .eq("id", userId);
        }
        break;
      }

      default:
        // Other events ignored — Stripe retries any 5xx.
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error", event.type, err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function applySubscriptionToProfile(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sub: Stripe.Subscription,
) {
  const userId = await resolveUserIdFromSubscription(sub);
  if (!userId) return;
  const isActive = sub.status === "active" || sub.status === "trialing";
  await admin
    .from("profiles")
    .update({
      plan: isActive ? "pro" : "free",
      stripe_subscription_id: sub.id,
      stripe_subscription_status: sub.status,
    })
    .eq("id", userId);
}

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const metaUser = (sub.metadata as Record<string, string> | undefined)?.supabase_user_id;
  if (metaUser) return metaUser;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
