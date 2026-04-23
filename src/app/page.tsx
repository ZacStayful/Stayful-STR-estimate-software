import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/intel-ui/Button";
import { Badge } from "@/components/intel-ui/Badge";
import { Card } from "@/components/intel-ui/Card";
import { getOptionalUser } from "@/lib/intel/auth";

export default async function LandingPage() {
  const user = await getOptionalUser();
  const authed = Boolean(user);

  return (
    <div className="min-h-screen bg-bg-dark">
      <PublicNav authed={authed} />

      <Hero authed={authed} />
      <StatsBar />
      <HowItWorks />
      <Comparison />
      <Testimonials />
      <Pricing authed={authed} />

      <Footer />
    </div>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="intel-grid intel-radial absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-20 md:py-28 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Badge tone="sage">STR revenue intelligence &middot; UK-wide</Badge>
          <h1 className="mt-5 font-heading text-4xl leading-[1.05] text-text-primary sm:text-5xl lg:text-6xl">
            Know exactly what your property will earn on Airbnb before you buy.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-text-muted">
            Stayful Intelligence pulls live Airbnb comparables, runs them through the same
            model Stayful uses to underwrite investor portfolios, and gives you a revenue
            estimate backed by data — not guesswork.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={authed ? "/estimate" : "/signup"}>
              <Button size="lg">Try 5 searches free</Button>
            </Link>
            <Link href="#how-it-works">
              <Button variant="outline" size="lg">
                See how it works
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-muted/80">
            No credit card required. Upgrade to Pro for £29/month.
          </p>
        </div>

        <DemoCard />
      </div>
    </section>
  );
}

function DemoCard() {
  return (
    <Card className="relative overflow-hidden p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Sample estimate</p>
          <p className="mt-1 font-heading text-lg text-text-primary">
            14 Gillygate, York YO31 7EQ
          </p>
          <p className="text-xs text-text-muted">Sleeps 4 &middot; 2 bed</p>
        </div>
        <Badge tone="sage">Live comps</Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <MiniMetric label="Annual" value="£26,400" accent />
        <MiniMetric label="Occupancy" value="74%" />
        <MiniMetric label="ADR" value="£96" />
        <MiniMetric label="SA uplift" value="+£8,200" accent />
      </div>

      <div className="mt-6 rounded-xl border border-intel-border bg-bg-card2 p-4">
        <div className="flex items-end justify-between">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            Monthly revenue &middot; seasonal curve
          </p>
          <Badge tone="outline">Pro unlocks full chart</Badge>
        </div>
        <div className="relative mt-4 flex h-24 items-end gap-1.5">
          {[0.4, 0.45, 0.55, 0.68, 0.8, 0.9, 1, 0.95, 0.75, 0.58, 0.48, 0.42].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-sage-deep/70"
              style={{ height: `${h * 100}%` }}
            />
          ))}
          <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-bg-card2 via-transparent to-transparent" />
        </div>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-intel-border bg-bg-card2 p-3">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={`mt-1 font-heading text-2xl ${
          accent ? "text-sage-mid" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatsBar() {
  const stats = [
    { label: "accuracy vs actual booking data", value: "±2%" },
    { label: "UK cities covered", value: "70+" },
    { label: "live comparables per estimate", value: "12" },
    { label: "turnaround", value: "<3s" },
  ];
  return (
    <section className="border-y border-intel-border bg-bg-card/60">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 sm:grid-cols-2 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="font-heading text-3xl text-text-primary">{s.value}</p>
            <p className="text-xs uppercase tracking-wider text-text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Enter the address",
      body: "Any UK postcode. The tool geocodes and pulls every active Airbnb listing within a tight radius.",
    },
    {
      n: "02",
      title: "Find comparable listings",
      body: "We filter comps down to the 12 most similar on beds, guest count, and property type — the same shortlist our underwriters use.",
    },
    {
      n: "03",
      title: "Get the estimate",
      body: "Annual revenue, occupancy, ADR, and a month-by-month forecast. Plus the short-let uplift vs a long-term tenancy.",
    },
  ];
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 max-w-xl">
        <Badge tone="outline">How it works</Badge>
        <h2 className="mt-3 font-heading text-3xl sm:text-4xl">
          From an address to a defensible number in under three seconds.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.n} className="p-6">
            <p className="font-heading text-sm text-sage-mid">{s.n}</p>
            <h3 className="mt-2 font-heading text-xl">{s.title}</h3>
            <p className="mt-2 text-sm text-text-muted">{s.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Comparison() {
  const rows: { label: string; stayful: string; pmi: string; airdna: string; airbtics: string }[] = [
    { label: "Live Airbnb comps", stayful: "12 per search", pmi: "No", airdna: "Aggregated only", airbtics: "Aggregated only" },
    { label: "UK-specific model", stayful: "Yes", pmi: "Yes", airdna: "No", airbtics: "No" },
    { label: "Seasonal breakdown", stayful: "Monthly 12mo", pmi: "No", airdna: "Quarterly", airbtics: "Monthly" },
    { label: "Long-let comparison", stayful: "Included", pmi: "Separate", airdna: "No", airbtics: "No" },
    { label: "PDF export", stayful: "Pro", pmi: "Paid", airdna: "Paid", airbtics: "Paid" },
    { label: "Price", stayful: "£29/mo", pmi: "£POA", airdna: "$129/mo+", airbtics: "$49/mo+" },
  ];
  return (
    <section id="compare" className="border-t border-intel-border bg-bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-xl">
          <Badge tone="outline">How we compare</Badge>
          <h2 className="mt-3 font-heading text-3xl sm:text-4xl">
            Built by operators, priced for investors.
          </h2>
          <p className="mt-3 text-text-muted">
            Every other tool on the market is either built for US markets, built for agencies
            with five-figure budgets, or both.
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-intel-border bg-bg-card">
          <table className="w-full text-sm">
            <thead className="bg-bg-card2 text-left text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-4 font-medium"> </th>
                <th className="px-4 py-4 font-medium text-sage-mid">Stayful Intelligence</th>
                <th className="px-4 py-4 font-medium">PMI</th>
                <th className="px-4 py-4 font-medium">AirDNA</th>
                <th className="px-4 py-4 font-medium">Airbtics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-intel-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-3 text-text-muted">{r.label}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{r.stayful}</td>
                  <td className="px-4 py-3 text-text-muted">{r.pmi}</td>
                  <td className="px-4 py-3 text-text-muted">{r.airdna}</td>
                  <td className="px-4 py-3 text-text-muted">{r.airbtics}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  // Placeholder copy — replace once real customer quotes are collected post-launch.
  const quotes = [
    {
      quote:
        "I used to spend half a day running comps in a spreadsheet before making an offer. Now I know whether to walk away in thirty seconds.",
      name: "Investor placeholder 1",
      role: "Portfolio landlord, York",
    },
    {
      quote:
        "The long-let vs short-let uplift is the number my accountant actually cares about. Getting it on one screen has changed how we underwrite.",
      name: "Investor placeholder 2",
      role: "Family office, Manchester",
    },
    {
      quote:
        "Finally a UK-specific tool. AirDNA was useless for my rural properties; Stayful actually has the data.",
      name: "Investor placeholder 3",
      role: "Buy-to-let landlord, Yorkshire Dales",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 max-w-xl">
        <Badge tone="outline">Testimonials</Badge>
        <h2 className="mt-3 font-heading text-3xl sm:text-4xl">Trusted at the coalface.</h2>
        <p className="mt-2 text-xs text-text-muted/70">
          Placeholder quotes ahead of launch — real testimonials appear here once customer
          consent is confirmed.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {quotes.map((q, i) => (
          <Card key={i} className="p-6" nested>
            <p className="text-sm text-text-primary">&ldquo;{q.quote}&rdquo;</p>
            <p className="mt-4 font-heading text-sm text-sage-mid">{q.name}</p>
            <p className="text-xs text-text-muted">{q.role}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Pricing({ authed }: { authed: boolean }) {
  return (
    <section id="pricing" className="border-t border-intel-border bg-bg-card/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 text-center">
          <Badge tone="outline">Pricing</Badge>
          <h2 className="mt-3 font-heading text-3xl sm:text-4xl">Two plans. No nonsense.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col p-6">
            <h3 className="font-heading text-xl">Free</h3>
            <p className="mt-1 text-sm text-text-muted">Run 5 estimates on us.</p>
            <p className="mt-4 font-heading text-4xl text-text-primary">£0</p>
            <ul className="mt-5 space-y-2 text-sm text-text-muted">
              <li>&bull; 5 full estimates</li>
              <li>&bull; 12 live Airbnb comps per search</li>
              <li>&bull; Monthly revenue breakdown</li>
              <li>&bull; SA vs long-let comparison</li>
            </ul>
            <div className="mt-6">
              <Link href={authed ? "/estimate" : "/signup"}>
                <Button variant="secondary" className="w-full">
                  Start free
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="relative flex flex-col border-sage-deep/60 p-6">
            <div className="absolute right-4 top-4">
              <Badge tone="sage">Most popular</Badge>
            </div>
            <h3 className="font-heading text-xl text-sage-mid">Pro</h3>
            <p className="mt-1 text-sm text-text-muted">For serious investors and operators.</p>
            <p className="mt-4 font-heading text-4xl text-text-primary">
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
                <Button className="w-full">Start with Pro</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
