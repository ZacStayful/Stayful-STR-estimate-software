import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getOptionalUser } from "@/lib/intel/auth";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const user = await getOptionalUser();
  const authed = Boolean(user);

  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          Pricing
        </span>
        <h1 className="mt-3 text-4xl tracking-tight">Simple pricing.</h1>
        <p className="mt-3 text-muted-foreground">
          14 days of full access, free. £29/month after that. Cancel any time.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">14-day trial</h2>
          <p className="mt-1 text-sm text-muted-foreground">Full access. No card needed.</p>
          <p className="mt-4 text-4xl font-semibold">£0</p>
          <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
            <li>&bull; Unlimited estimates for 14 days</li>
            <li>&bull; PDF reports + setup calculator</li>
            <li>&bull; Live Airbnb comparables</li>
            <li>&bull; Monthly revenue forecasts</li>
            <li>&bull; SA vs long-let comparison</li>
          </ul>
          <div className="mt-6">
            <Link href={authed ? "/estimate" : "/signup"}>
              <Button variant="outline" className="w-full" size="lg">
                {authed ? "Open the tool" : "Start free"}
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative flex flex-col rounded-2xl border border-primary/50 bg-card p-6">
          <div className="absolute right-4 top-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              Most popular
            </span>
          </div>
          <h2 className="text-xl font-semibold text-primary">Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">Unlimited, after the trial.</p>
          <p className="mt-4 text-4xl font-semibold">
            £29 <span className="text-base font-normal text-muted-foreground">/ month</span>
          </p>
          <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
            <li>&bull; Everything in the trial</li>
            <li>&bull; Saved searches dashboard</li>
            <li>&bull; Priority email support</li>
            <li>&bull; Cancel any time</li>
          </ul>
          <div className="mt-6">
            <Link href={authed ? "/upgrade" : "/signup"}>
              <Button className="w-full" size="lg">
                {authed ? "Upgrade now" : "Start with Pro"}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
