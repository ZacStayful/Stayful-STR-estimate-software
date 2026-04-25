import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/intel/PublicNav";
import { Footer } from "@/components/intel/Footer";
import { getOptionalUser } from "@/lib/intel/auth";

export default async function LandingPage() {
  const user = await getOptionalUser();
  const authed = Boolean(user);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav authed={authed} />

      <main className="flex-1">
        <Hero authed={authed} />
        <Features />
        <HowItWorks />
        <Pricing authed={authed} />
      </main>

      <Footer />
    </div>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            STR revenue intelligence &middot; UK-wide
          </span>
          <h1 className="mt-5 text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Know exactly what your property will earn on Airbnb before you buy.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Stayful Intelligence pulls live Airbnb comparables, runs them through the same
            model Stayful uses to underwrite investor portfolios, and gives you a defensible
            revenue estimate &mdash; with comparables, a 6-page PDF report, and a setup
            cost calculator built in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={authed ? "/estimate" : "/signup"}>
              <Button size="lg">{authed ? "Open the tool" : "Start 14-day free trial"}</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                See pricing
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required. £29/month after the trial. Cancel any time.
          </p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "Live Airbnb comparables",
      body: "12 actively-let comps per search, filtered by beds, capacity and property type — the same shortlist our underwriters use.",
    },
    {
      title: "Monthly revenue forecast",
      body: "Seasonal curve broken down month-by-month with ADR and occupancy assumptions you can sanity-check against your gut.",
    },
    {
      title: "Long-let comparison",
      body: "Side-by-side with the long-term tenancy yield for the same property, so you can see the SA uplift before committing.",
    },
    {
      title: "6-page PDF report",
      body: "A polished, lender-ready PDF with comps, charts, local risk and growth potential. Email it to partners or save for your file.",
    },
    {
      title: "Setup cost calculator",
      body: "Itemised furnish-and-list quote so you know your day-one capital outlay before the offer letter goes in.",
    },
    {
      title: "Local risk + growth",
      body: "Hospitals, universities, airports, train stations, events &mdash; the demand drivers that justify (or kill) your numbers.",
    },
  ];
  return (
    <section id="features" className="border-b border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl tracking-tight sm:text-4xl">
          Everything you need to underwrite a UK STR property — in under three seconds.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-background p-5">
              <h3 className="text-lg font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Enter the address", body: "Any UK postcode. We geocode it and pull every active Airbnb listing within a tight radius." },
    { n: "02", title: "Find comparable listings", body: "We filter to the 12 most similar on beds, guest count and property type. Same shortlist our underwriters use." },
    { n: "03", title: "Get the estimate", body: "Annual revenue, occupancy, ADR, monthly forecast, SA-vs-long-let uplift, and a downloadable PDF." },
  ];
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="max-w-xl text-3xl tracking-tight sm:text-4xl">
        From an address to a defensible number in under three seconds.
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-border bg-background p-6">
            <p className="text-sm font-semibold text-primary">{s.n}</p>
            <h3 className="mt-2 text-xl font-medium">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing({ authed }: { authed: boolean }) {
  return (
    <section id="pricing" className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl tracking-tight sm:text-4xl">Simple pricing.</h2>
        <p className="mt-3 text-muted-foreground">
          14 days of full access, free. £29/month after that. Cancel any time.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background p-6 text-left">
            <h3 className="text-xl font-medium">14-day trial</h3>
            <p className="mt-1 text-sm text-muted-foreground">Full access. No card needed.</p>
            <p className="mt-4 text-4xl font-semibold">£0</p>
            <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
              <li>&bull; Unlimited estimates for 14 days</li>
              <li>&bull; PDF reports + setup calculator</li>
              <li>&bull; All comps + monthly forecasts</li>
            </ul>
            <div className="mt-6">
              <Link href={authed ? "/estimate" : "/signup"}>
                <Button variant="outline" className="w-full">
                  {authed ? "Open the tool" : "Start free"}
                </Button>
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/50 bg-background p-6 text-left">
            <h3 className="text-xl font-medium text-primary">Pro</h3>
            <p className="mt-1 text-sm text-muted-foreground">Unlimited, after the trial.</p>
            <p className="mt-4 text-4xl font-semibold">
              £29 <span className="text-base font-normal text-muted-foreground">/ month</span>
            </p>
            <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
              <li>&bull; Everything in the trial</li>
              <li>&bull; Saved searches dashboard</li>
              <li>&bull; Priority support</li>
              <li>&bull; Cancel any time</li>
            </ul>
            <div className="mt-6">
              <Link href={authed ? "/upgrade" : "/signup"}>
                <Button className="w-full">{authed ? "Upgrade now" : "Start with Pro"}</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
