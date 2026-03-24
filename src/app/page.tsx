"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Search,
  MapPin,
  BedDouble,
  Users,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  GraduationCap,
  Plane,
  TrainFront,
  Calendar,
  Ticket,
  Heart,
  Star,
  Phone,
  FileText,
  ChevronRight,
  Loader2,
  DollarSign,
  BarChart3,
  Target,
  Zap,
  Clock,
  Home,
  Wrench,
  MessageSquare,
  Camera,
  ClipboardCheck,
  LineChart,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalysisResult, RiskLevel, VerdictFit } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function gbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function fitColor(fit: VerdictFit): string {
  if (fit === "strong") return "bg-success text-success-foreground";
  if (fit === "moderate") return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

function fitBorder(fit: VerdictFit): string {
  if (fit === "strong") return "border-l-success";
  if (fit === "moderate") return "border-l-warning";
  return "border-l-destructive";
}

function riskColor(level: RiskLevel): string {
  if (level === "low") return "bg-success text-success-foreground";
  if (level === "moderate") return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

function riskTextColor(level: RiskLevel): string {
  if (level === "low") return "text-success";
  if (level === "moderate") return "text-warning";
  return "text-destructive";
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [bedrooms, setBedrooms] = useState("2");
  const [guests, setGuests] = useState("4");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          postcode,
          bedrooms: Number(bedrooms),
          guests: Number(guests),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setResult(data as AnalysisResult);
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  // ─── Loading State ──────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <Image
            alt="Stayful"
            width={140}
            height={45}
            className="h-10 w-auto"
            src="/images/stayful-logo.png"
            priority
          />
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-lg font-medium text-foreground">
              Analysing your property...
            </span>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            We are gathering data from multiple sources including Airbtics,
            PropertyData, Google Places, and Ticketmaster. This usually takes
            10-20 seconds.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              "Short-let revenue",
              "Long-let valuation",
              "Nearby amenities",
              "Local events",
            ].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs text-card-foreground ring-1 ring-foreground/10"
              >
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ─── Report State ───────────────────────────────────────────────

  if (result) {
    const r = result;
    const f = r.financials;
    const v = r.verdict;
    const risk = r.risk;

    // Monthly chart data
    const chartData = MONTHS.map((month, i) => ({
      month,
      "Short Let": r.shortLet.monthlyRevenue[i],
      "Long Let": Math.round(r.longLet.monthlyRent),
    }));

    // Sorted months for best/worst
    const indexedMonths = r.shortLet.monthlyRevenue.map((rev, i) => ({
      month: MONTHS[i],
      revenue: rev,
    }));
    const sorted = [...indexedMonths].sort((a, b) => b.revenue - a.revenue);
    const strongest = sorted.slice(0, 3);
    const weakest = sorted.slice(-3).reverse();

    // Scenarios
    const bestCase = Math.round(f.shortLetGrossAnnual * 1.15);
    const likelyCase = f.shortLetGrossAnnual;
    const weakCase = Math.round(f.shortLetGrossAnnual * 0.75);

    // Demand scoring helper
    function demandLevel(count: number): {
      label: string;
      color: string;
    } {
      if (count >= 3) return { label: "High", color: "bg-success text-success-foreground" };
      if (count >= 1) return { label: "Moderate", color: "bg-warning text-warning-foreground" };
      return { label: "Low", color: "bg-destructive/10 text-destructive" };
    }

    const demandCategories = [
      {
        key: "hospitals" as const,
        label: "Hospitals & Clinics",
        icon: Heart,
        items: r.demandDrivers.hospitals,
      },
      {
        key: "universities" as const,
        label: "Universities",
        icon: GraduationCap,
        items: r.demandDrivers.universities,
      },
      {
        key: "airports" as const,
        label: "Airports",
        icon: Plane,
        items: r.demandDrivers.airports,
      },
      {
        key: "trainStations" as const,
        label: "Train Stations",
        icon: TrainFront,
        items: r.demandDrivers.trainStations,
      },
    ];

    // Risk dimensions grouped
    const financialRisks = [
      { label: "Income Volatility", level: risk.incomeVolatility },
      { label: "Seasonality", level: risk.seasonality },
      { label: "Competition", level: risk.competition },
    ];
    const operationalRisks = [
      { label: "Setup Cost", level: risk.setupCost },
      { label: "Guest Damage", level: risk.guestDamage },
      { label: "Platform Dependency", level: risk.platformDependency },
    ];
    const complianceRisks = [
      { label: "Regulatory", level: risk.regulatory },
      { label: "Location Demand", level: risk.locationDemand },
    ];

    return (
      <main className="min-h-screen bg-background">
        {/* Report Header */}
        <header className="border-b border-border bg-primary py-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Image
                alt="Stayful"
                width={120}
                height={40}
                className="h-8 w-auto"
                src="/images/stayful-logo.png"
                priority
              />
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-primary-foreground">
                  Property Analysis Report
                </p>
                <p className="text-xs text-primary-foreground/70">
                  {r.property.address}, {r.property.postcode}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Analyse Another
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* ── Section 1: Verdict Card ────────────────────────────── */}
          <section className="mb-10">
            <Card className={`border-l-4 ${fitBorder(v.fit)}`}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Property Verdict</CardTitle>
                    <CardDescription>
                      {r.property.address}, {r.property.postcode} &middot;{" "}
                      {r.property.bedrooms} bed &middot; {r.property.guests}{" "}
                      guests
                    </CardDescription>
                  </div>
                  <Badge className={`text-sm ${fitColor(v.fit)}`}>
                    {v.fit === "strong"
                      ? "Strong Fit"
                      : v.fit === "moderate"
                        ? "Moderate Fit"
                        : "Weak Fit"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      Short-Let Fit Rating
                    </p>
                    <p className="mt-1 text-lg font-bold capitalize text-foreground">
                      {v.fit}
                    </p>
                  </div>
                  <div className="rounded-lg bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      Net vs Long Let
                    </p>
                    <p
                      className={`mt-1 text-lg font-bold ${f.annualDifference >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {f.annualDifference >= 0 ? "+" : ""}
                      {gbp(f.monthlyDifference)}/mo
                    </p>
                  </div>
                  <div className="rounded-lg bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground">Risk Level</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge className={riskColor(v.riskLevel)}>
                        {v.riskLevel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ({risk.overallScore}/10)
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      Owner Involvement
                    </p>
                    <p className="mt-1 text-lg font-bold capitalize text-foreground">
                      {v.ownerInvolvement}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        with Stayful
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-muted/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recommended Action
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">
                    {v.recommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Section 2: Financial Outcome ───────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={DollarSign}
              title="Financial Outcome"
              subtitle="Projected annual revenue comparison between short-term and long-term letting"
            />

            {/* Revenue cards */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">
                    Gross STL Revenue
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(f.shortLetGrossAnnual)}
                  </p>
                  <p className="text-xs text-muted-foreground">per year</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">
                    Net STL Revenue
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(f.shortLetNetAnnual)}
                  </p>
                  <p className="text-xs text-muted-foreground">after costs</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">
                    Long-Let Gross
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(f.longLetGrossAnnual)}
                  </p>
                  <p className="text-xs text-muted-foreground">per year</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Long-Let Net</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(f.longLetNetAnnual)}
                  </p>
                  <p className="text-xs text-muted-foreground">after costs</p>
                </CardContent>
              </Card>
            </div>

            {/* Profit difference highlight */}
            <Card className="mb-6">
              <CardContent className="flex flex-col items-center gap-2 py-6 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Monthly Profit Difference
                  </p>
                  <p
                    className={`text-3xl font-bold ${f.monthlyDifference >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {f.monthlyDifference >= 0 ? "+" : ""}
                    {gbp(f.monthlyDifference)}
                    <span className="text-base font-normal text-muted-foreground">
                      /month
                    </span>
                  </p>
                </div>
                <div className="hidden h-12 w-px bg-border sm:block" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Annual Profit Difference
                  </p>
                  <p
                    className={`text-3xl font-bold ${f.annualDifference >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {f.annualDifference >= 0 ? "+" : ""}
                    {gbp(f.annualDifference)}
                    <span className="text-base font-normal text-muted-foreground">
                      /year
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Scenarios */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <TrendingUp className="mx-auto h-5 w-5 text-success" />
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Best Case
                  </p>
                  <p className="mt-1 text-xl font-bold text-success">
                    {gbp(bestCase)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    gross annual (+15%)
                  </p>
                </CardContent>
              </Card>
              <Card className="ring-2 ring-primary/30">
                <CardContent className="pt-4 text-center">
                  <BarChart3 className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Likely Case
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {gbp(likelyCase)}
                  </p>
                  <p className="text-xs text-muted-foreground">gross annual</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <TrendingDown className="mx-auto h-5 w-5 text-destructive" />
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Weak Case
                  </p>
                  <p className="mt-1 text-xl font-bold text-destructive">
                    {gbp(weakCase)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    gross annual (-25%)
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 12-Month Comparison Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  12-Month Revenue Comparison
                </CardTitle>
                <CardDescription>
                  Monthly short-let revenue vs long-let rental income
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="15%">
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: "#6e9164" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6e9164" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                        width={50}
                      />
                      <Tooltip
                        formatter={(value) => [gbp(Number(value ?? 0)), ""]}
                        contentStyle={{
                          backgroundColor: "#e6ebd7",
                          border: "1px solid #aab99b",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                      />
                      <ReferenceLine y={0} stroke="#aab99b" />
                      <Bar
                        dataKey="Short Let"
                        fill="#5d8156"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Long Let"
                        fill="#c3cdaf"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Section 3: Stability & Downside ────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Shield}
              title="Stability & Downside"
              subtitle="Understand the seasonal variation and minimum occupancy requirements"
            />

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Strongest months */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-success" />
                    Strongest 3 Months
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {strongest.map((m) => (
                      <div
                        key={m.month}
                        className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2"
                      >
                        <span className="text-sm font-medium">{m.month}</span>
                        <span className="text-sm font-bold text-success">
                          {gbp(m.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Weakest months */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    Weakest 3 Months
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {weakest.map((m) => (
                      <div
                        key={m.month}
                        className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2"
                      >
                        <span className="text-sm font-medium">{m.month}</span>
                        <span className="text-sm font-bold text-destructive">
                          {gbp(m.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Break-even + monthly indicators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-primary" />
                    Break-Even Occupancy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 text-center">
                    <p className="text-3xl font-bold text-foreground">
                      {pct(f.breakEvenOccupancy)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      occupancy needed to match long-let
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Monthly Health
                    </p>
                    <div className="grid grid-cols-6 gap-1">
                      {r.shortLet.monthlyRevenue.map((rev, i) => {
                        const longLetMonthly = r.longLet.monthlyRent;
                        let bg = "bg-success";
                        if (rev < longLetMonthly * 0.8) bg = "bg-destructive";
                        else if (rev < longLetMonthly) bg = "bg-warning";
                        return (
                          <div key={i} className="text-center">
                            <div
                              className={`h-3 w-full rounded-sm ${bg}`}
                              title={`${MONTHS[i]}: ${gbp(rev)}`}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {MONTHS[i]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-sm bg-success" />
                        Strong
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-sm bg-warning" />
                        Acceptable
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-sm bg-destructive" />
                        Below comfort
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Section 4: Market Comparables ──────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Building2}
              title="Market Comparables"
              subtitle="Nearby properties used to benchmark performance"
            />

            {r.shortLet.comparables.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Short-Let Comparables
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {r.shortLet.comparables.map((comp, i) => (
                    <Card key={i} size="sm">
                      <CardContent className="pt-3">
                        <p
                          className="truncate text-sm font-medium text-foreground"
                          title={comp.title}
                        >
                          {comp.title || `Listing ${i + 1}`}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">
                              Bedrooms
                            </span>
                            <p className="font-semibold">{comp.bedrooms}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">ADR</span>
                            <p className="font-semibold">
                              {gbp(comp.averageDailyRate)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Occupancy
                            </span>
                            <p className="font-semibold">
                              {pct(comp.occupancyRate)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Annual Rev
                            </span>
                            <p className="font-semibold">
                              {gbp(comp.annualRevenue)}
                            </p>
                          </div>
                        </div>
                        {comp.distance != null && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {comp.distance} km away
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {r.longLet.comparables.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Long-Let Comparables
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Address</th>
                        <th className="pb-2 font-medium">Beds</th>
                        <th className="pb-2 font-medium">Rent/mo</th>
                        <th className="pb-2 font-medium">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.longLet.comparables.map((comp, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {comp.address || `Property ${i + 1}`}
                          </td>
                          <td className="py-2 pr-4">{comp.bedrooms}</td>
                          <td className="py-2 pr-4">{gbp(comp.rent)}</td>
                          <td className="py-2 text-muted-foreground">
                            {comp.distance} km
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {r.shortLet.comparables.length === 0 &&
              r.longLet.comparables.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No comparable properties were returned by the data sources.
                  </CardContent>
                </Card>
              )}
          </section>

          {/* ── Section 5: Demand Drivers ──────────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Zap}
              title="Demand Drivers"
              subtitle="Nearby amenities that drive guest demand in this area"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {demandCategories.map((cat) => {
                const demand = demandLevel(cat.items.length);
                const nearest = cat.items.length > 0 ? cat.items[0] : null;

                return (
                  <Card key={cat.key}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <cat.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {cat.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {cat.items.length} found nearby
                            </p>
                          </div>
                        </div>
                        <Badge className={demand.color}>{demand.label}</Badge>
                      </div>
                      {nearest && (
                        <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
                          <p className="font-medium text-foreground">
                            Nearest: {nearest.name}
                          </p>
                          <p className="text-muted-foreground">
                            {nearest.distance} km away
                            {nearest.rating
                              ? ` · ${nearest.rating} rating`
                              : ""}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ── Section 6: Events & Entertainment ──────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Ticket}
              title="Events & Entertainment"
              subtitle="Upcoming local events that could drive bookings"
            />

            <Card className="mb-4">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {r.nearbyEvents.totalEvents}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    upcoming events within 15 miles — area vibrancy{" "}
                    <Badge
                      className={
                        r.nearbyEvents.totalEvents >= 50
                          ? "bg-success text-success-foreground"
                          : r.nearbyEvents.totalEvents >= 15
                            ? "bg-warning text-warning-foreground"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      {r.nearbyEvents.totalEvents >= 50
                        ? "High"
                        : r.nearbyEvents.totalEvents >= 15
                          ? "Moderate"
                          : "Low"}
                    </Badge>
                  </p>
                </div>
              </CardContent>
            </Card>

            {r.nearbyEvents.events.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {r.nearbyEvents.events.slice(0, 12).map((event, i) => (
                  <Card key={i} size="sm">
                    <CardContent className="pt-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {event.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {event.date}
                        </span>
                        {event.time && <span>at {event.time}</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.venue}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        {event.category && (
                          <Badge className="bg-primary/10 text-primary">
                            {event.category}
                          </Badge>
                        )}
                        {event.genre &&
                          event.genre !== "Undefined" &&
                          event.genre !== event.category && (
                            <Badge className="bg-secondary text-secondary-foreground">
                              {event.genre}
                            </Badge>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No upcoming events found within 15 miles.
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Section 7: Risk Profile ────────────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={AlertTriangle}
              title="Risk Profile"
              subtitle="Comprehensive risk assessment across financial, operational, and compliance dimensions"
            />

            {/* Overall risk */}
            <Card className="mb-6">
              <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:justify-center sm:gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Overall Risk Score
                  </p>
                  <p
                    className={`text-4xl font-bold ${riskTextColor(v.riskLevel)}`}
                  >
                    {risk.overallScore}
                    <span className="text-lg font-normal text-muted-foreground">
                      /10
                    </span>
                  </p>
                </div>
                <Badge className={`text-base ${riskColor(v.riskLevel)}`}>
                  {v.riskLevel === "low"
                    ? "Low Risk"
                    : v.riskLevel === "moderate"
                      ? "Moderate Risk"
                      : "High Risk"}
                </Badge>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Financial risks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Financial
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {financialRisks.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{r.label}</span>
                        <Badge className={riskColor(r.level)}>{r.level}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Operational risks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-primary" />
                    Operational
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {operationalRisks.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{r.label}</span>
                        <Badge className={riskColor(r.level)}>{r.level}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Compliance risks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {complianceRisks.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{r.label}</span>
                        <Badge className={riskColor(r.level)}>{r.level}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Section 8: What Stayful Manages ────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Star}
              title="What Stayful Manages"
              subtitle="A clear breakdown of responsibilities between Stayful and you"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Stayful Handles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      {
                        icon: MessageSquare,
                        text: "Guest communications & booking management",
                      },
                      {
                        icon: LineChart,
                        text: "Dynamic pricing optimisation",
                      },
                      {
                        icon: Home,
                        text: "Professional cleaning coordination",
                      },
                      {
                        icon: Wrench,
                        text: "Maintenance & repair coordination",
                      },
                      {
                        icon: Zap,
                        text: "Key management & guest access",
                      },
                      {
                        icon: FileText,
                        text: "Monthly owner statements & reporting",
                      },
                      {
                        icon: BookOpen,
                        text: "Direct booking strategy & channel management",
                      },
                      {
                        icon: BarChart3,
                        text: "Quarterly performance reviews",
                      },
                    ].map((item) => (
                      <li key={item.text} className="flex items-start gap-3">
                        <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span className="text-sm">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                    <Home className="h-4 w-4" />
                    Owner Handles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      {
                        icon: DollarSign,
                        text: "Mortgage & property finance",
                      },
                      {
                        icon: Zap,
                        text: "Utilities (gas, electric, water, broadband)",
                      },
                      {
                        icon: FileText,
                        text: "Council tax payments",
                      },
                      {
                        icon: Building2,
                        text: "Property purchase & ownership decisions",
                      },
                      {
                        icon: ClipboardCheck,
                        text: "Major renovation & capital improvement approvals",
                      },
                    ].map((item) => (
                      <li key={item.text} className="flex items-start gap-3">
                        <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Section 9: Onboarding Timeline ─────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Clock}
              title="Onboarding Timeline"
              subtitle="What to expect from signing to your first guest"
            />

            <Card>
              <CardContent className="py-6">
                <div className="relative">
                  {/* Desktop horizontal timeline */}
                  <div className="hidden lg:block">
                    <div className="flex items-start justify-between">
                      {[
                        {
                          step: "1",
                          title: "Sign Agreement",
                          desc: "Review & sign management contract",
                          icon: FileText,
                        },
                        {
                          step: "2",
                          title: "Onboarding Call",
                          desc: "Discuss goals & property details",
                          icon: Phone,
                        },
                        {
                          step: "3",
                          title: "Setup & Furnishing",
                          desc: "Prepare property to STL standard",
                          icon: Home,
                        },
                        {
                          step: "4",
                          title: "Photography",
                          desc: "Professional photos & floor plan",
                          icon: Camera,
                        },
                        {
                          step: "5",
                          title: "Inspection",
                          desc: "Health & safety compliance check",
                          icon: ClipboardCheck,
                        },
                        {
                          step: "6",
                          title: "Listing Live",
                          desc: "Published on Airbnb, Booking.com & more",
                          icon: Zap,
                        },
                        {
                          step: "7",
                          title: "Monthly Statements",
                          desc: "Transparent income reporting",
                          icon: LineChart,
                        },
                        {
                          step: "8",
                          title: "Quarterly Reviews",
                          desc: "Performance analysis & strategy",
                          icon: BarChart3,
                        },
                      ].map((item, i, arr) => (
                        <div
                          key={item.step}
                          className="relative flex flex-1 flex-col items-center text-center"
                        >
                          {i < arr.length - 1 && (
                            <div className="absolute left-1/2 top-5 h-0.5 w-full bg-primary/20" />
                          )}
                          <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                            <item.icon className="h-4 w-4" />
                          </div>
                          <p className="mt-2 text-xs font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-0.5 max-w-[100px] text-[10px] leading-tight text-muted-foreground">
                            {item.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile vertical timeline */}
                  <div className="space-y-4 lg:hidden">
                    {[
                      {
                        step: "1",
                        title: "Sign Agreement",
                        desc: "Review & sign management contract",
                        icon: FileText,
                      },
                      {
                        step: "2",
                        title: "Onboarding Call",
                        desc: "Discuss goals & property details",
                        icon: Phone,
                      },
                      {
                        step: "3",
                        title: "Setup & Furnishing",
                        desc: "Prepare property to STL standard",
                        icon: Home,
                      },
                      {
                        step: "4",
                        title: "Photography",
                        desc: "Professional photos & floor plan",
                        icon: Camera,
                      },
                      {
                        step: "5",
                        title: "Inspection",
                        desc: "Health & safety compliance check",
                        icon: ClipboardCheck,
                      },
                      {
                        step: "6",
                        title: "Listing Live",
                        desc: "Published on Airbnb, Booking.com & more",
                        icon: Zap,
                      },
                      {
                        step: "7",
                        title: "Monthly Statements",
                        desc: "Transparent income reporting",
                        icon: LineChart,
                      },
                      {
                        step: "8",
                        title: "Quarterly Reviews",
                        desc: "Performance analysis & strategy",
                        icon: BarChart3,
                      },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Section 10: Footer CTA ─────────────────────────────── */}
          <section className="mb-10">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <h2 className="text-2xl font-bold">Ready to get started?</h2>
                <p className="max-w-lg text-sm text-primary-foreground/80">
                  Let Stayful handle the hard work while you earn more from your
                  property. Our team will guide you through every step of the
                  onboarding process.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() =>
                      window.open("mailto:hello@stayful.co.uk", "_blank")
                    }
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Contact Stayful
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                    onClick={() =>
                      window.open("#", "_blank")
                    }
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View Agreement PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Footer */}
        <footer className="border-t border-border bg-muted/30 py-8">
          <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
            <Image
              alt="Stayful"
              loading="lazy"
              width={100}
              height={35}
              className="mx-auto mb-4 h-8 w-auto opacity-60"
              src="/images/stayful-logo.png"
            />
            <p>
              &copy; {new Date().getFullYear()} Stayful. All rights reserved.
            </p>
            <p className="mt-2">
              Data sourced from Airbtics, AirDNA, OpenRent, and public market
              research.
            </p>
          </div>
        </footer>
      </main>
    );
  }

  // ─── Form State (Default) ────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary py-12 sm:py-16 lg:py-20">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <Image
              alt="Stayful"
              width={180}
              height={60}
              className="mb-6 h-12 w-auto sm:h-14"
              src="/images/stayful-logo.png"
              priority
            />
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
              Short-Term Rental Property Analyser
            </h1>
            <p className="mb-8 max-w-2xl text-lg text-primary-foreground/80">
              Get a comprehensive revenue analysis for your property. Compare
              short-term rental potential against traditional letting with real
              market data.
            </p>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className="relative z-10 -mt-8 pb-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
                Analyse Your Property
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Property Address
                  </Label>
                  <Input
                    id="address"
                    placeholder="e.g. 123 High Street"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postcode" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Postcode
                  </Label>
                  <Input
                    id="postcode"
                    placeholder="e.g. M4 7FE"
                    required
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="bedrooms"
                      className="flex items-center gap-2"
                    >
                      <BedDouble className="h-4 w-4" aria-hidden="true" />
                      Bedrooms
                    </Label>
                    <Input
                      type="number"
                      id="bedrooms"
                      min={1}
                      max={10}
                      required
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="guests"
                      className="flex items-center gap-2"
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Max Guests
                    </Label>
                    <Input
                      type="number"
                      id="guests"
                      min={1}
                      max={16}
                      required
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  Get Free Analysis
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <Image
            alt="Stayful"
            loading="lazy"
            width={100}
            height={35}
            className="mx-auto mb-4 h-8 w-auto opacity-60"
            src="/images/stayful-logo.png"
          />
          <p>
            &copy; {new Date().getFullYear()} Stayful. All rights reserved.
          </p>
          <p className="mt-2">
            Data sourced from Airbtics, AirDNA, OpenRent, and public market
            research.
          </p>
        </div>
      </footer>
    </main>
  );
}
