import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/intel-ui/Badge";
import { Card } from "@/components/intel-ui/Card";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { PasswordResetLink } from "@/components/PasswordResetLink";
import { OpenBillingPortalButton, UpgradeButton } from "@/components/UpgradeButton";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { FREE_SEARCH_LIMIT } from "@/lib/intel/search-limits";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email, profile } = await requireUserAndProfile("/account");
  const params = await searchParams;
  const justUpgraded = params.upgraded === "true";
  const isPro = profile.plan === "pro";

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl text-text-primary sm:text-4xl">Account</h1>
      <p className="mt-1 text-sm text-text-muted">Manage your plan, billing, and account.</p>

      {justUpgraded && (
        <div className="mt-6 rounded-xl border border-sage-deep/50 bg-sage-deep/15 p-4 text-sm text-text-primary">
          Welcome to Pro. Unlimited estimates are now unlocked.
        </div>
      )}

      <div className="mt-8 space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted">Plan</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-heading text-2xl capitalize text-text-primary">{profile.plan}</p>
                {isPro && <Badge tone="sage">PRO</Badge>}
              </div>
              {!isPro && (
                <p className="mt-1 text-sm text-text-muted">
                  {profile.searches_used} of {FREE_SEARCH_LIMIT} free searches used.
                </p>
              )}
              {isPro && profile.stripe_subscription_status && (
                <p className="mt-1 text-sm text-text-muted">
                  Subscription status: <span className="capitalize text-text-primary">
                    {profile.stripe_subscription_status}
                  </span>
                </p>
              )}
            </div>
            <div>
              {!isPro ? (
                <div className="w-56">
                  <UpgradeButton label="Upgrade to Pro" />
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {isPro && (
          <Card className="p-6">
            <p className="text-xs uppercase tracking-wider text-text-muted">Billing</p>
            <p className="mt-2 text-sm text-text-muted">
              Update your payment method, download invoices, or cancel your subscription through
              the Stripe billing portal.
            </p>
            <div className="mt-4">
              <OpenBillingPortalButton />
            </div>
          </Card>
        )}

        <Card className="p-6">
          <p className="text-xs uppercase tracking-wider text-text-muted">Account details</p>
          <p className="mt-2 text-sm text-text-muted">Email</p>
          <p className="mt-1 text-text-primary">{email}</p>
          <div className="mt-4">
            <PasswordResetLink email={email} />
          </div>
        </Card>

        <Card className="border-destructive/40 p-6">
          <p className="text-xs uppercase tracking-wider text-text-muted">Danger zone</p>
          <p className="mt-2 text-sm text-text-muted">
            Deleting your account cancels any active subscription and removes your saved searches
            permanently.
          </p>
          <div className="mt-4">
            <DeleteAccountButton />
          </div>
        </Card>
      </div>

      <Link href="/estimate" className="mt-10 inline-block text-sm text-text-muted hover:text-text-primary">
        &larr; Back to estimate tool
      </Link>
    </section>
  );
}
