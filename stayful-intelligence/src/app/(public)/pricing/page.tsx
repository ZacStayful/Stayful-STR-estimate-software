import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/intel-ui/Badge";
import { Button } from "@/components/intel-ui/Button";
import { Card } from "@/components/intel-ui/Card";
import { getOptionalUser } from "@/lib/intel/auth";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const user = await getOptionalUser();
  const authed = Boolean(user);

  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="mb-10 text-center">
        <Badge tone="outline">Pricing</Badge>
        <h1 className="mt-3 font-heading text-4xl">Two plans. No nonsense.</h1>
        <p className="mt-3 text-text-muted">
          Start with 5 free estimates. Upgrade to Pro when you&apos;re running comps daily.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col p-6">
          <h2 className="font-heading text-xl">Free</h2>
          <p className="mt-1 text-sm text-text-muted">Kick the tyres, run the numbers.</p>
          <p className="mt-4 font-heading text-4xl">£0</p>
          <ul className="mt-5 space-y-2 text-sm text-text-muted">
            <li>&bull; 5 full estimates</li>
            <li>&bull; 12 live Airbnb comps per search</li>
            <li>&bull; Monthly revenue breakdown</li>
            <li>&bull; SA vs long-let comparison</li>
          </ul>
          <div className="mt-6">
            <Link href={authed ? "/estimate" : "/signup"}>
              <Button variant="secondary" className="w-full">
                {authed ? "Go to tool" : "Start free"}
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="relative flex flex-col border-sage-deep/60 p-6">
          <div className="absolute right-4 top-4">
            <Badge tone="sage">Most popular</Badge>
          </div>
          <h2 className="font-heading text-xl text-sage-mid">Pro</h2>
          <p className="mt-1 text-sm text-text-muted">Unlimited, built for operators.</p>
          <p className="mt-4 font-heading text-4xl">
            £29 <span className="text-base text-text-muted">/ month</span>
          </p>
          <ul className="mt-5 space-y-2 text-sm text-text-muted">
            <li>&bull; Unlimited estimates</li>
            <li>&bull; Saved searches dashboard</li>
            <li>&bull; PDF exports for lenders &amp; partners</li>
            <li>&bull; Priority support</li>
            <li>&bull; Cancel any time</li>
          </ul>
          <div className="mt-6">
            <Link href={authed ? "/upgrade" : "/signup"}>
              <Button className="w-full">{authed ? "Upgrade now" : "Start with Pro"}</Button>
            </Link>
          </div>
        </Card>
      </div>
    </section>
  );
}
