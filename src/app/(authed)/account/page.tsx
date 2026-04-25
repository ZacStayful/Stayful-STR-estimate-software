import Link from "next/link";
import type { Metadata } from "next";
import { DeleteAccountButton } from "@/components/intel/DeleteAccountButton";
import { PasswordResetLink } from "@/components/intel/PasswordResetLink";
import { OpenBillingPortalButton, UpgradeButton } from "@/components/intel/UpgradeButton";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { accessState, TRIAL_DAYS } from "@/lib/intel/access";
import { formatDate } from "@/lib/intel/format";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email, profile } = await requireUserAndProfile("/account");
  const access = accessState(profile);
  const params = await searchParams;
  const justUpgraded = params.upgraded === "true";

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your plan, billing, and account.</p>

      {justUpgraded && (
        <div className="mt-6 rounded-xl border border-primary/50 bg-primary/10 p-4 text-sm">
          Welcome to Pro. Unlimited access is now unlocked.
        </div>
      )}

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Plan</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-2xl font-semibold capitalize">{profile.plan}</p>
                {access.kind === "pro" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">PRO</span>
                )}
              </div>
              {access.kind === "trialing" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {access.daysRemaining} of {TRIAL_DAYS} trial days remaining &middot; ends {formatDate(profile.trial_ends_at)}
                </p>
              )}
              {access.kind === "expired" && (
                <p className="mt-1 text-sm text-destructive">
                  Trial ended {formatDate(profile.trial_ends_at)}. Subscribe to keep access.
                </p>
              )}
              {access.kind === "pro" && profile.stripe_subscription_status && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Subscription: <span className="capitalize text-foreground">{profile.stripe_subscription_status}</span>
                </p>
              )}
            </div>
            {access.kind !== "pro" && (
              <div className="w-full max-w-xs">
                <UpgradeButton label={access.kind === "expired" ? "Subscribe to continue" : "Upgrade to Pro"} />
              </div>
            )}
          </div>
        </div>

        {access.kind === "pro" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Billing</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Update payment method, download invoices, or cancel your subscription via Stripe.
            </p>
            <div className="mt-4">
              <OpenBillingPortalButton />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Account details</p>
          <p className="mt-2 text-sm text-muted-foreground">Email</p>
          <p className="mt-1 text-foreground">{email}</p>
          <div className="mt-4">
            <PasswordResetLink email={email} />
          </div>
        </div>

        <div className="rounded-2xl border border-destructive/40 bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Danger zone</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Deleting your account cancels any active subscription and permanently removes your saved
            searches.
          </p>
          <div className="mt-4">
            <DeleteAccountButton />
          </div>
        </div>
      </div>

      <Link href="/estimate" className="mt-10 inline-block text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to the analyser
      </Link>
    </section>
  );
}
