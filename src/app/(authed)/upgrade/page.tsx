import Link from "next/link";
import type { Metadata } from "next";
import { UpgradeButton } from "@/components/intel/UpgradeButton";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { accessState } from "@/lib/intel/access";

export const metadata: Metadata = { title: "Upgrade to Pro" };

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireUserAndProfile("/upgrade");
  const access = accessState(profile);
  const params = await searchParams;
  const trialExpired = params.reason === "trial_expired" || access.kind === "expired";
  const cancelled = params.cancelled === "true";

  // If they're already Pro, show a friendly note instead of the upgrade card.
  const alreadyPro = access.kind === "pro";

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        Upgrade to Pro
      </span>
      <h1 className="mt-4 text-4xl tracking-tight sm:text-5xl">
        {trialExpired
          ? "Your 14-day free trial has ended."
          : alreadyPro
            ? "You're on Pro."
            : "Ready for unlimited access?"}
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        {alreadyPro
          ? "Your subscription is active. Manage billing from your account."
          : "Subscribe for £29/month to keep using the analyser, PDF reports and setup calculator. Cancel any time."}
      </p>

      {cancelled && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Checkout cancelled. You can upgrade any time.
        </p>
      )}

      {!alreadyPro && (
        <div className="mt-10 w-full rounded-2xl border border-primary/50 bg-card p-8 text-left">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-primary">Pro</h2>
              <p className="text-sm text-muted-foreground">Everything you need to underwrite.</p>
            </div>
            <p className="text-4xl font-semibold">
              £29 <span className="text-base font-normal text-muted-foreground">/ mo</span>
            </p>
          </div>
          <ul className="mt-6 space-y-1.5 text-sm text-muted-foreground">
            <li>&bull; Unlimited estimates</li>
            <li>&bull; Saved searches dashboard</li>
            <li>&bull; PDF reports for lenders &amp; partners</li>
            <li>&bull; Setup cost calculator</li>
            <li>&bull; Priority email support</li>
            <li>&bull; Cancel any time from your account page</li>
          </ul>
          <div className="mt-8">
            <UpgradeButton />
          </div>
        </div>
      )}

      <Link
        href={alreadyPro ? "/account" : "/estimate"}
        className="mt-8 text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; {alreadyPro ? "Account" : "Back to the tool"}
      </Link>
    </section>
  );
}
