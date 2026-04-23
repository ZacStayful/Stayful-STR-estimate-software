import Link from "next/link";
import type { Metadata } from "next";
import { UpgradeButton } from "@/components/UpgradeButton";
import { Badge } from "@/components/intel-ui/Badge";
import { Card } from "@/components/intel-ui/Card";
import { requireUserAndProfile } from "@/lib/intel/auth";

export const metadata: Metadata = { title: "Upgrade to Pro" };

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireUserAndProfile("/upgrade");
  const params = await searchParams;
  const cancelled = params.cancelled === "true";

  const limitReached = profile.plan === "free" && profile.searches_used >= 5;

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
      <Badge tone="outline">Upgrade to Pro</Badge>
      <h1 className="mt-4 font-heading text-4xl text-text-primary sm:text-5xl">
        {limitReached
          ? "You've used your 5 free searches."
          : "Ready for unlimited access?"}
      </h1>
      <p className="mt-3 max-w-xl text-text-muted">
        Upgrade to Pro for unlimited estimates, saved searches, and PDF exports — the full
        Stayful underwriting toolkit for £29 a month.
      </p>

      {cancelled && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Checkout cancelled. You can upgrade any time.
        </p>
      )}

      <Card className="mt-10 w-full border-sage-deep/60 p-8 text-left">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-heading text-2xl text-sage-mid">Pro</h2>
            <p className="text-sm text-text-muted">Everything you need to underwrite.</p>
          </div>
          <p className="font-heading text-4xl">
            £29 <span className="text-base text-text-muted">/ mo</span>
          </p>
        </div>
        <ul className="mt-6 space-y-2 text-sm text-text-muted">
          <li>&bull; Unlimited property estimates</li>
          <li>&bull; Saved searches dashboard with historical snapshots</li>
          <li>&bull; PDF exports branded for investor pitches &amp; lenders</li>
          <li>&bull; Priority email support</li>
          <li>&bull; Cancel any time from your account page</li>
        </ul>
        <div className="mt-8">
          <UpgradeButton />
        </div>
      </Card>

      <Link
        href="/dashboard"
        className="mt-8 text-sm text-text-muted hover:text-text-primary"
      >
        &larr; Back to dashboard
      </Link>
    </section>
  );
}
