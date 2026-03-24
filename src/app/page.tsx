"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  Bus,
  TrainTrack,
  Calendar,
  Ticket,
  Heart,
  Star,
  Phone,
  FileText,
  ChevronRight,
  ChevronDown,
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
  Layers,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Eye,
  Briefcase,
  Palmtree,
  Baby,
  PartyPopper,
  Info,
  Wifi,
  Flame,
  Droplets,
  Sparkles,
  Car,
  Monitor,
  Coffee,
  Database,
  Calculator,
  Globe,
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
import Presentation from "@/components/Presentation";
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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Seasonal weighting for monthly occupancy distribution
const SEASONAL_WEIGHTS = [0.7, 0.72, 0.85, 0.95, 1.05, 1.15, 1.25, 1.3, 1.1, 0.9, 0.75, 0.65];

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

// ─── Tab definitions ─────────────────────────────────────────────

const TAB_SECTIONS = [
  { id: "overview", label: "Overview", num: 1 },
  { id: "comparables", label: "Comparables", num: 2 },
  { id: "amenities", label: "Amenities", num: 3 },
  { id: "revenue", label: "Revenue", num: 4 },
  { id: "profit-calculator", label: "Profit Calculator", num: 5 },
  { id: "forecast", label: "Forecast", num: 6 },
  { id: "local-area", label: "Local Area", num: 7 },
  { id: "bookings", label: "Bookings", num: 8 },
  { id: "risk", label: "Risk", num: 9 },
  { id: "data-sources", label: "Data Sources", num: 10 },
  { id: "growth", label: "Growth", num: 11 },
] as const;

// ─── Main Component ─────────────────────────────────────────────

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [bedrooms, setBedrooms] = useState("2");
  const [guests, setGuests] = useState("4");
  const [propertyType, setPropertyType] = useState("Flat");
  const [monthlyMortgage, setMonthlyMortgage] = useState("");
  const [monthlyBills, setMonthlyBills] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [currentMessage, setCurrentMessage] = useState("");

  // Tab / scroll tracking state
  const [activeTab, setActiveTab] = useState("overview");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Profit calculator state
  const [calcMortgage, setCalcMortgage] = useState(0);
  const [calcBills, setCalcBills] = useState(400);

  const setSectionRef = useCallback((id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  // IntersectionObserver for active tab tracking
  useEffect(() => {
    if (!result) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the largest intersection ratio
        let bestEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
              bestEntry = entry;
            }
          }
        }
        if (bestEntry && bestEntry.target.id) {
          setActiveTab(bestEntry.target.id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 0.25, 0.5] }
    );

    // Observe all sections
    const timer = setTimeout(() => {
      TAB_SECTIONS.forEach(({ id }) => {
        const el = sectionRefs.current[id];
        if (el) observer.observe(el);
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [result]);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      const yOffset = -110;
      const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  const ANALYSIS_STAGES = [
    { key: "geocoding", label: "Locating property..." },
    { key: "short_let", label: "Fetching short-let data..." },
    { key: "long_let", label: "Fetching long-let valuation..." },
    { key: "amenities", label: "Finding nearby amenities..." },
    { key: "events", label: "Discovering local events..." },
    { key: "analysis", label: "Running analysis..." },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setProgress(0);
    setCompletedStages(new Set());
    setCurrentMessage("Starting analysis...");

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          postcode,
          bedrooms: Number(bedrooms),
          guests: Number(guests),
          propertyType,
          ...(monthlyMortgage !== "" && { monthlyMortgage: Number(monthlyMortgage) }),
          ...(monthlyBills !== "" && { monthlyBills: Number(monthlyBills) }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (!res.body) {
        setError("Streaming not supported by this browser.");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.stage === "error") {
                setError(event.message);
                setLoading(false);
                return;
              }

              if (event.progress != null) {
                setProgress(event.progress);
              }
              if (event.message) {
                setCurrentMessage(event.message);
              }

              if (event.stage === "geocoding" && event.progress >= 20) {
                setCompletedStages((prev) => new Set(prev).add("geocoding"));
              }
              if (event.stage === "short_let") {
                setCompletedStages((prev) => new Set(prev).add("short_let"));
              }
              if (event.stage === "long_let") {
                setCompletedStages((prev) => new Set(prev).add("long_let"));
              }
              if (event.stage === "amenities" && event.progress >= 75) {
                setCompletedStages((prev) => new Set(prev).add("amenities"));
              }
              if (event.stage === "events") {
                setCompletedStages((prev) => new Set(prev).add("events"));
              }
              if (event.stage === "analysis") {
                setCompletedStages((prev) => new Set(prev).add("analysis"));
              }

              if (event.stage === "complete" && event.data) {
                setResult(event.data as AnalysisResult);
                setLoading(false);
                return;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }

      if (!result) {
        setError("Analysis stream ended unexpectedly. Please try again.");
        setLoading(false);
      }
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again."
      );
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
        <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
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

          {/* Progress bar */}
          <div className="w-full">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentMessage}</span>
              <span className="font-mono font-semibold">{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="w-full space-y-2 text-left">
            {ANALYSIS_STAGES.map((stage) => {
              const done = completedStages.has(stage.key);
              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ring-1 transition-colors duration-300 ${
                    done
                      ? "bg-success/10 text-success ring-success/20"
                      : "bg-card text-card-foreground ring-foreground/10"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                  ) : (
                    <div className="h-4 w-4 flex-shrink-0 animate-pulse rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span className={done ? "line-through opacity-70" : ""}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="max-w-md text-xs text-muted-foreground">
            Gathering data from Airbtics, PropertyData, Google Places, and
            Ticketmaster. This usually takes 10-20 seconds.
          </p>
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
      monthFull: MONTH_NAMES[i],
      revenue: rev,
      index: i,
    }));
    const sorted = [...indexedMonths].sort((a, b) => b.revenue - a.revenue);

    // Revenue cost breakdown calculations
    const grossAnnual = f.shortLetGrossAnnual;
    const platformFees = Math.round(grossAnnual * 0.15);
    const managementFees = Math.round(grossAnnual * 0.15);
    const cleaningLaundry = Math.round(grossAnnual * 0.18);
    const totalOperatingCosts = platformFees + managementFees + cleaningLaundry;
    const stlNetAnnual = grossAnnual - totalOperatingCosts;

    const ltlGrossAnnual = f.longLetGrossAnnual;
    const ltlAgentFees = Math.round(ltlGrossAnnual * 0.10);
    const ltlNetAnnual = ltlGrossAnnual - ltlAgentFees;

    const revDifference = stlNetAnnual - ltlNetAnnual;
    const revDifferenceMonthly = Math.round(revDifference / 12);
    const revDifferencePct = ltlNetAnnual > 0 ? Math.round((revDifference / ltlNetAnnual) * 100) : 0;

    // Profit calculator values
    const stlTrueAnnualProfit = stlNetAnnual - (calcMortgage * 12) - (calcBills * 12);
    const ltlTrueAnnualProfit = ltlNetAnnual - (calcMortgage * 12); // tenants pay bills
    const profitDifference = stlTrueAnnualProfit - ltlTrueAnnualProfit;

    // Monthly occupancy with seasonal weighting
    const avgOcc = r.shortLet.occupancyRate;
    const totalWeight = SEASONAL_WEIGHTS.reduce((s, w) => s + w, 0);
    const monthlyOccupancy = SEASONAL_WEIGHTS.map((w) =>
      Math.min(1, (avgOcc * 12 * w) / totalWeight)
    );

    // Net monthly for STL (after 48% costs)
    const stlMonthlyNet = r.shortLet.monthlyRevenue.map((rev) => Math.round(rev * 0.52));
    const ltlMonthlyNet = Math.round(ltlNetAnnual / 12);

    // Peak months (STL net > LTL net)
    const peakMonthCount = stlMonthlyNet.filter((net) => net > ltlMonthlyNet).length;
    const belowLtlCount = 12 - peakMonthCount;

    // Best/worst month
    const bestMonthIdx = stlMonthlyNet.indexOf(Math.max(...stlMonthlyNet));
    const worstMonthIdx = stlMonthlyNet.indexOf(Math.min(...stlMonthlyNet));

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
      {
        key: "busStations" as const,
        label: "Bus Stations",
        icon: Bus,
        items: r.demandDrivers.busStations,
      },
      {
        key: "subwayStations" as const,
        label: "Subway / Metro",
        icon: TrainTrack,
        items: r.demandDrivers.subwayStations,
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

    // Risk level to /100 score
    const riskToScore = (level: RiskLevel): number => {
      if (level === "low") return 85;
      if (level === "moderate") return 55;
      return 25;
    };

    // Direct booking score calculation
    const hospitals = r.demandDrivers.hospitals.length;
    const universities = r.demandDrivers.universities.length;
    const totalTransport = r.demandDrivers.trainStations.length + r.demandDrivers.busStations.length + r.demandDrivers.subwayStations.length;
    const totalEvents = r.nearbyEvents.totalEvents;
    const demandDriverCount = [hospitals > 0, universities > 0, totalTransport > 0, totalEvents > 0].filter(Boolean).length;

    let bookingScore = 0;
    const bookingFactors: { label: string; score: number; max: number }[] = [];

    const hospScore = hospitals > 0 ? 15 : 0;
    bookingScore += hospScore;
    bookingFactors.push({ label: "Nearby Hospitals", score: hospScore, max: 15 });

    const uniScore = universities > 0 ? 15 : 0;
    bookingScore += uniScore;
    bookingFactors.push({ label: "Nearby Universities", score: uniScore, max: 15 });

    const transportScore = totalTransport >= 3 ? 20 : totalTransport >= 1 ? 12 : 0;
    bookingScore += transportScore;
    bookingFactors.push({ label: "Transport Links", score: transportScore, max: 20 });

    const eventScore = totalEvents >= 100 ? 25 : totalEvents >= 50 ? 15 : totalEvents > 0 ? 5 : 0;
    bookingScore += eventScore;
    bookingFactors.push({ label: "Local Events", score: eventScore, max: 25 });

    const driverBonus = demandDriverCount >= 3 ? 10 : demandDriverCount >= 2 ? 5 : 0;
    bookingScore += driverBonus;
    bookingFactors.push({ label: "Demand Diversity", score: driverBonus, max: 10 });

    // Base score for having a property
    bookingScore += 15;
    bookingFactors.push({ label: "Property Baseline", score: 15, max: 15 });

    const bookingRating = bookingScore >= 80 ? "Excellent" : bookingScore >= 60 ? "Strong" : bookingScore >= 40 ? "Good" : "Limited";
    const bookingRatingColor = bookingScore >= 80 ? "text-success" : bookingScore >= 60 ? "text-success" : bookingScore >= 40 ? "text-warning" : "text-destructive";

    // Demand drivers narrative
    const nearbyTypes: string[] = [];
    if (hospitals > 0) nearbyTypes.push("hospitals");
    if (universities > 0) nearbyTypes.push("universities");
    if (totalTransport > 0) nearbyTypes.push("transport hubs");
    if (totalEvents > 30) nearbyTypes.push("event venues");

    const guestTypes: string[] = [];
    if (hospitals > 0) guestTypes.push("families visiting patients", "medical professionals");
    if (universities > 0) guestTypes.push("students", "visiting academics");
    if (totalTransport > 0) guestTypes.push("business travellers", "contractors");
    if (totalEvents > 30) guestTypes.push("event attendees");
    if (guestTypes.length === 0) guestTypes.push("leisure travellers", "weekend visitors");

    const narrative = `Your ${r.property.bedrooms}-bedroom property accommodating ${r.property.guests} guests is well-positioned to attract ${guestTypes.slice(0, 3).join(", ")}${nearbyTypes.length > 0 ? ` based on nearby ${nearbyTypes.join(", ")}` : ""}. The local area provides ${demandDriverCount >= 3 ? "strong" : demandDriverCount >= 2 ? "moderate" : "emerging"} demand diversity which supports consistent occupancy throughout the year.`;

    // Y3 extra monthly profit from direct bookings (save 15% platform fees on 50% of bookings)
    const y3ExtraMonthlyProfit = Math.round((grossAnnual * 0.5 * 0.15) / 12);

    // Current active tab info for progress indicator
    const activeTabInfo = TAB_SECTIONS.find((t) => t.id === activeTab);

    return (
      <>
      {showPresentation && (
        <Presentation data={r} onClose={() => setShowPresentation(false)} />
      )}
      <main className="min-h-screen bg-background">
        {/* Report Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-primary py-4">
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
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowPresentation(true)}>
                <Monitor className="mr-1.5 h-3.5 w-3.5" />
                Present
              </Button>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Analyse Another
              </Button>
            </div>
          </div>
        </header>

        {/* Tab Navigation Bar - sticky below header */}
        <nav className="sticky top-[65px] z-30 border-b border-border bg-card/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 overflow-x-auto py-2 scrollbar-hide">
              {TAB_SECTIONS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.num}. {tab.label}
                </button>
              ))}
            </div>
            {/* Progress indicator */}
            <div className="flex items-center justify-between border-t border-border/50 py-1 text-[10px] text-muted-foreground">
              <span>{activeTabInfo ? `${activeTabInfo.num} of 11` : ""}</span>
              <span className="font-medium">{activeTabInfo?.label ?? ""}</span>
            </div>
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:px-8">

          {/* ══════════════════════════════════════════════════════════
              Section 1: Overview
              ══════════════════════════════════════════════════════════ */}
          <section id="overview" ref={setSectionRef("overview")} className="mb-12">
            {/* Verdict Card */}
            <Card className={`border-l-4 ${fitBorder(v.fit)}`}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Property Verdict</CardTitle>
                    <CardDescription>
                      {r.property.address}, {r.property.postcode} &middot;{" "}
                      {r.property.bedrooms} bed &middot; Sleeps {r.property.guests}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-sm ${fitColor(v.fit)}`}>
                      {v.fit === "strong"
                        ? "Strong Fit"
                        : v.fit === "moderate"
                          ? "Moderate Fit"
                          : "Weak Fit"}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => setShowPresentation(true)}
                    >
                      <Monitor className="mr-1.5 h-3.5 w-3.5" />
                      View Presentation
                    </Button>
                  </div>
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

            {/* Big Stat Cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Card className="bg-primary/5 ring-primary/20">
                <CardContent className="py-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Gross Revenue
                  </p>
                  <p className="mt-2 text-3xl font-bold text-foreground">
                    {gbp(grossAnnual)}
                    <span className="text-base font-normal text-muted-foreground">/year</span>
                  </p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    {gbp(Math.round(grossAnnual / 12))}/month
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-success/5 ring-success/20">
                <CardContent className="py-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Net Revenue
                  </p>
                  <p className="mt-2 text-3xl font-bold text-success">
                    {gbp(stlNetAnnual)}
                    <span className="text-base font-normal text-muted-foreground">/year</span>
                  </p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    {gbp(Math.round(stlNetAnnual / 12))}/month
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    After booking platform fees, cleaning, laundry and property management
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 2: Comparables
              ══════════════════════════════════════════════════════════ */}
          <section id="comparables" ref={setSectionRef("comparables")} className="mb-12">
            <SectionHeading
              icon={Building2}
              title={`${r.shortLet.comparables.length > 0 ? r.shortLet.comparables.length : "Market"} Comparable Properties Analysed`}
              subtitle={`Similar ${r.property.bedrooms}-bedroom properties accommodating ${r.property.guests} guests within your area.`}
            />

            {/* Market stats row */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Avg Nightly Rate</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(r.shortLet.averageDailyRate)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Avg Occupancy</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {pct(r.shortLet.occupancyRate)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Avg Annual Revenue</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {gbp(r.shortLet.annualRevenue)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {r.shortLet.comparables.length > 0 ? (
              <Card>
                <CardContent className="py-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Property</th>
                          <th className="pb-2 font-medium">Nightly Rate</th>
                          <th className="pb-2 font-medium">Occupancy</th>
                          <th className="pb-2 font-medium">Est. Revenue</th>
                          <th className="pb-2 font-medium">Distance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.shortLet.comparables.map((comp, i) => (
                          <tr
                            key={i}
                            className="border-b border-border/50 last:border-0"
                          >
                            <td className="py-2 pr-4">
                              <p className="font-medium truncate max-w-[200px]">
                                {comp.title || `Listing ${i + 1}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {comp.bedrooms} bed &middot; Sleeps {comp.accommodates}
                              </p>
                            </td>
                            <td className="py-2 pr-4 font-semibold">
                              {gbp(comp.averageDailyRate)}
                            </td>
                            <td className="py-2 pr-4">{pct(comp.occupancyRate)}</td>
                            <td className="py-2 pr-4 font-semibold">
                              {gbp(comp.annualRevenue)}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {comp.distance != null ? `${comp.distance} km` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-l-4 border-l-primary">
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Market-Level Data Shown
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        The market statistics above represent aggregate data for your area. For individual comparable listings with detailed performance metrics, contact Stayful for a comprehensive assessment.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Long-let comparables */}
            {r.longLet.comparables.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Long-Let Comparables
                </h3>
                <Card>
                  <CardContent className="py-4">
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
                  </CardContent>
                </Card>
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 3: Advised Amenities
              ══════════════════════════════════════════════════════════ */}
          <section id="amenities" ref={setSectionRef("amenities")} className="mb-12">
            <SectionHeading
              icon={Star}
              title="Advised Amenities"
              subtitle="Recommended amenities to maximise your occupancy rate and nightly rate"
            />

            {/* Essential Amenities */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Essential Amenities (Must Have)
                </CardTitle>
                <CardDescription>
                  These amenities are expected by guests and found in 5/5 top-performing properties
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { icon: Wifi, label: "WiFi", note: "5/5 top properties" },
                    { icon: Flame, label: "Kitchen", note: "5/5 top properties" },
                    { icon: Flame, label: "Heating", note: "5/5 top properties" },
                    { icon: Droplets, label: "Hot Water", note: "5/5 top properties" },
                    { icon: Sparkles, label: "Towels & Linens", note: "5/5 top properties" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg bg-success/5 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                      </div>
                      <Badge className="bg-success/10 text-success">{item.note}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recommended Amenities */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Recommended Amenities (Competitive Edge)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { icon: Car, label: "Free Parking" },
                    { icon: Briefcase, label: "Workspace" },
                    { icon: Monitor, label: "Smart TV" },
                    { icon: Coffee, label: "Coffee Machine" },
                    { icon: RefreshCw, label: "Washing Machine" },
                    { icon: Sparkles, label: "Iron" },
                  ].map((item) => (
                    <Card key={item.label} size="sm">
                      <CardContent className="flex flex-col items-center py-4 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <item.icon className="h-5 w-5 text-primary" />
                        </div>
                        <p className="mt-2 text-xs font-medium text-foreground">
                          {item.label}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Unique Differentiators */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-warning" />
                  Unique Differentiators
                </CardTitle>
                <CardDescription>
                  These amenities command rate premiums of 15-30%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Hot Tub",
                    "EV Charger",
                    "Pet Friendly",
                    "Smart Lock",
                    "High-Speed Internet",
                  ].map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-full bg-warning/10 px-4 py-2 text-sm font-semibold text-warning ring-1 ring-warning/20"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Properties with unique differentiators typically achieve 15-30% higher nightly rates and improved occupancy.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 4: Revenue (Short-Term vs Long-Term Breakdown)
              ══════════════════════════════════════════════════════════ */}
          <section id="revenue" ref={setSectionRef("revenue")} className="mb-12">
            <SectionHeading
              icon={DollarSign}
              title="Revenue Breakdown"
              subtitle="Detailed cost analysis: Short-Term vs Long-Term letting"
            />

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Short-Term Rental Estimate */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Short-Term Rental Estimate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                      <span className="text-sm font-medium">Gross Revenue</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground">{gbp(grossAnnual)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({gbp(Math.round(grossAnnual / 12))}/mo)</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-sm text-muted-foreground">Platform Fees (15%)</span>
                      <span className="text-sm font-medium text-destructive">-{gbp(platformFees)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-sm text-muted-foreground">Management Fees (15%)</span>
                      <span className="text-sm font-medium text-destructive">-{gbp(managementFees)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-sm text-muted-foreground">Cleaning & Laundry (18%)</span>
                      <span className="text-sm font-medium text-destructive">-{gbp(cleaningLaundry)}</span>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex items-center justify-between rounded-lg bg-destructive/5 px-4 py-3">
                      <span className="text-sm font-medium">Total Operating Costs (48%)</span>
                      <span className="text-sm font-bold text-destructive">-{gbp(totalOperatingCosts)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-success/10 px-4 py-3">
                      <span className="text-sm font-bold text-foreground">Net Annual Revenue</span>
                      <div className="text-right">
                        <span className="text-lg font-bold text-success">{gbp(stlNetAnnual)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({gbp(Math.round(stlNetAnnual / 12))}/mo)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Long-Term Let Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Long-Term Let Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                      <span className="text-sm font-medium">Gross Rental Income</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground">{gbp(ltlGrossAnnual)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({gbp(Math.round(ltlGrossAnnual / 12))}/mo)</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-sm text-muted-foreground">Letting Agent Fees (10%)</span>
                      <span className="text-sm font-medium text-destructive">-{gbp(ltlAgentFees)}</span>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                      <span className="text-sm font-bold text-foreground">Net Annual Revenue</span>
                      <div className="text-right">
                        <span className="text-lg font-bold text-foreground">{gbp(ltlNetAnnual)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({gbp(Math.round(ltlNetAnnual / 12))}/mo)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Difference Card */}
            <Card className={`mt-6 border-l-4 ${revDifference >= 0 ? "border-l-success" : "border-l-destructive"}`}>
              <CardContent className="flex flex-col items-center gap-2 py-6 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Short-Term vs Long-Term Difference
                  </p>
                  <p className={`text-3xl font-bold ${revDifference >= 0 ? "text-success" : "text-destructive"}`}>
                    {revDifference >= 0 ? "+" : ""}{gbp(revDifference)}
                    <span className="text-base font-normal text-muted-foreground">/year</span>
                  </p>
                </div>
                <div className="hidden h-12 w-px bg-border sm:block" />
                <div>
                  <p className={`text-xl font-bold ${revDifference >= 0 ? "text-success" : "text-destructive"}`}>
                    {revDifference >= 0 ? "+" : ""}{gbp(revDifferenceMonthly)}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ({revDifferencePct >= 0 ? "+" : ""}{revDifferencePct}% vs long-term let)
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 5: Profit Calculator (Interactive)
              ══════════════════════════════════════════════════════════ */}
          <section id="profit-calculator" ref={setSectionRef("profit-calculator")} className="mb-12">
            <SectionHeading
              icon={Calculator}
              title="Profit Calculator"
              subtitle="Enter your monthly costs to see your true profit for both short-term and long-term letting"
            />

            {/* Inputs */}
            <Card className="mb-6">
              <CardContent className="py-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="calc-mortgage" className="text-sm font-semibold">
                      Monthly Mortgage
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      <Input
                        id="calc-mortgage"
                        type="number"
                        min={0}
                        className="pl-7"
                        value={calcMortgage}
                        onChange={(e) => setCalcMortgage(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calc-bills" className="text-sm font-semibold">
                      Monthly Bills
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      <Input
                        id="calc-bills"
                        type="number"
                        min={0}
                        className="pl-7"
                        value={calcBills}
                        onChange={(e) => setCalcBills(Number(e.target.value) || 0)}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Recommended: £400 (Council Tax, Utilities, WiFi)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Side-by-side comparison */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Short-Term Let */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Short-Term Let</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm">Net Revenue</span>
                      <span className="text-sm font-semibold">{gbp(stlNetAnnual)}</span>
                    </div>
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">Mortgage</span>
                      <span className="text-sm text-destructive">-{gbp(calcMortgage * 12)}</span>
                    </div>
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">Bills</span>
                      <span className="text-sm text-destructive">-{gbp(calcBills * 12)}</span>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between rounded-lg bg-success/10 px-4 py-3">
                      <span className="text-sm font-bold">True Annual Profit</span>
                      <div className="text-right">
                        <span className={`text-lg font-bold ${stlTrueAnnualProfit >= 0 ? "text-success" : "text-destructive"}`}>
                          {gbp(stlTrueAnnualProfit)}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {gbp(Math.round(stlTrueAnnualProfit / 12))}/month
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Long-Term Let */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Long-Term Let</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm">Net Revenue</span>
                      <span className="text-sm font-semibold">{gbp(ltlNetAnnual)}</span>
                    </div>
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">Mortgage</span>
                      <span className="text-sm text-destructive">-{gbp(calcMortgage * 12)}</span>
                    </div>
                    <div className="flex justify-between px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">Bills</span>
                      <span className="text-sm font-medium text-success">Tenant pays</span>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-3">
                      <span className="text-sm font-bold">True Annual Profit</span>
                      <div className="text-right">
                        <span className={`text-lg font-bold ${ltlTrueAnnualProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {gbp(ltlTrueAnnualProfit)}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {gbp(Math.round(ltlTrueAnnualProfit / 12))}/month
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Extra Profit Card */}
            <Card className={`mt-6 border-l-4 ${profitDifference >= 0 ? "border-l-success" : "border-l-destructive"}`}>
              <CardContent className="py-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Extra Profit with Short-Term Let
                </p>
                <p className={`mt-2 text-3xl font-bold ${profitDifference >= 0 ? "text-success" : "text-destructive"}`}>
                  {profitDifference >= 0 ? "+" : ""}{gbp(profitDifference)}
                  <span className="text-base font-normal text-muted-foreground">/year</span>
                </p>
                <p className={`text-lg font-semibold ${profitDifference >= 0 ? "text-success" : "text-destructive"}`}>
                  {profitDifference >= 0 ? "+" : ""}{gbp(Math.round(profitDifference / 12))}/month
                </p>
                {profitDifference > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Short-term letting generates {gbp(Math.round(profitDifference / 12))} more per month even after accounting for bills you&apos;ll need to cover.
                  </p>
                )}
              </CardContent>
            </Card>

            <p className="mt-3 text-xs text-muted-foreground text-center">
              Short-term let bills are your responsibility. With long-term lets, tenants typically pay their own bills.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 6: 12-Month Forecast
              ══════════════════════════════════════════════════════════ */}
          <section id="forecast" ref={setSectionRef("forecast")} className="mb-12">
            <SectionHeading
              icon={LineChart}
              title="12-Month Forecast"
              subtitle="Monthly revenue projections with seasonal adjustments"
            />

            {/* Stats row */}
            <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Peak Months</p>
                  <p className="mt-1 text-2xl font-bold text-success">{peakMonthCount}</p>
                  <p className="text-[10px] text-muted-foreground">STL beats LTL</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Below Long-Let</p>
                  <p className="mt-1 text-2xl font-bold text-destructive">{belowLtlCount}</p>
                  <p className="text-[10px] text-muted-foreground">months</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Best Month</p>
                  <p className="mt-1 text-lg font-bold text-success">{MONTH_NAMES[bestMonthIdx]}</p>
                  <p className="text-xs font-semibold text-success">{gbp(stlMonthlyNet[bestMonthIdx])}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Worst Month</p>
                  <p className="mt-1 text-lg font-bold text-destructive">{MONTH_NAMES[worstMonthIdx]}</p>
                  <p className="text-xs font-semibold text-destructive">{gbp(stlMonthlyNet[worstMonthIdx])}</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card className="mb-6">
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

            {/* Monthly breakdown table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 font-medium">Short-Term Net</th>
                        <th className="pb-2 font-medium">Long-Term Net</th>
                        <th className="pb-2 font-medium">Difference</th>
                        <th className="pb-2 font-medium">Occupancy</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map((month, i) => {
                        const stlNet = stlMonthlyNet[i];
                        const diff = stlNet - ltlMonthlyNet;
                        const isPeak = stlNet > ltlMonthlyNet;
                        return (
                          <tr
                            key={month}
                            className={`border-b border-border/50 last:border-0 ${isPeak ? "bg-success/5" : ""}`}
                          >
                            <td className="py-2 pr-4 font-medium">{MONTH_NAMES[i]}</td>
                            <td className="py-2 pr-4 font-semibold">{gbp(stlNet)}</td>
                            <td className="py-2 pr-4">{gbp(ltlMonthlyNet)}</td>
                            <td className={`py-2 pr-4 font-semibold ${diff >= 0 ? "text-success" : "text-destructive"}`}>
                              {diff >= 0 ? "+" : ""}{gbp(diff)}
                            </td>
                            <td className="py-2 pr-4">{Math.round(monthlyOccupancy[i] * 100)}%</td>
                            <td className="py-2">
                              {isPeak && (
                                <Badge className="bg-success/10 text-success">Peak</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 7: Local Area Intelligence
              ══════════════════════════════════════════════════════════ */}
          <section id="local-area" ref={setSectionRef("local-area")} className="mb-12">
            <SectionHeading
              icon={MapPin}
              title="Local Area Intelligence"
              subtitle="Understanding where your bookings are likely to come from"
            />

            {/* Narrative */}
            <Card className="mb-6 border-l-4 border-l-primary">
              <CardContent className="py-6">
                <h3 className="text-sm font-bold text-foreground mb-2">
                  Why People Would Book Your Property
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {narrative}
                </p>
              </CardContent>
            </Card>

            {/* Demand Drivers List */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {demandCategories.map((cat) => {
                const demand = demandLevel(cat.items.length);
                const nearest = cat.items.length > 0 ? cat.items[0] : null;
                const impact = cat.items.length >= 3 ? "High" : cat.items.length >= 1 ? "Medium" : "Low";

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
                              {cat.items.length} found nearby &middot; Impact: {impact}
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

            {/* Demand Category Scoring Cards */}
            {(() => {
              const hospCount = r.demandDrivers.hospitals.length;
              const uniCount = r.demandDrivers.universities.length;
              const airportCount = r.demandDrivers.airports.length;
              const trainCount = r.demandDrivers.trainStations.length;
              const totalTrans = trainCount + r.demandDrivers.busStations.length + r.demandDrivers.subwayStations.length;
              const evtCount = r.nearbyEvents.totalEvents;

              type ScoreLevel = "High" | "Moderate" | "Low";
              const scoreColor = (s: ScoreLevel) =>
                s === "High"
                  ? "bg-success text-success-foreground"
                  : s === "Moderate"
                    ? "bg-warning text-warning-foreground"
                    : "bg-destructive/10 text-destructive";

              const categories: {
                name: string;
                icon: React.ElementType;
                score: ScoreLevel;
                explanation: string;
              }[] = [
                {
                  name: "Corporate / Contractor",
                  icon: Briefcase,
                  score: hospCount >= 2 && totalTrans >= 3 ? "High" : hospCount >= 1 || totalTrans >= 2 ? "Moderate" : "Low",
                  explanation: hospCount >= 2 && totalTrans >= 3
                    ? "Strong hospital and transport links attract business travellers"
                    : hospCount >= 1 || totalTrans >= 2
                      ? "Some nearby employers and transport options"
                      : "Limited corporate demand drivers in the area",
                },
                {
                  name: "Leisure / Tourism",
                  icon: Palmtree,
                  score: evtCount >= 50 && airportCount >= 1 ? "High" : evtCount >= 15 ? "Moderate" : "Low",
                  explanation: evtCount >= 50 && airportCount >= 1
                    ? "Active events scene with good airport access"
                    : evtCount >= 15
                      ? "Moderate local events and attractions"
                      : "Limited tourism and leisure activity nearby",
                },
                {
                  name: "Family Visit",
                  icon: Baby,
                  score: totalTrans >= 2 && hospCount >= 1 ? "High" : trainCount >= 1 ? "Moderate" : "Low",
                  explanation: totalTrans >= 2 && hospCount >= 1
                    ? "Good transport and hospital access for visiting families"
                    : trainCount >= 1
                      ? "Train access supports family visits"
                      : "Limited transport links for visiting families",
                },
                {
                  name: "Event-driven",
                  icon: PartyPopper,
                  score: evtCount >= 100 ? "High" : evtCount >= 30 ? "Moderate" : "Low",
                  explanation: evtCount >= 100
                    ? `${evtCount} upcoming events create strong booking demand`
                    : evtCount >= 30
                      ? `${evtCount} upcoming events provide periodic demand spikes`
                      : "Few events nearby to drive short-stay bookings",
                },
                {
                  name: "Student",
                  icon: GraduationCap,
                  score: uniCount >= 2 ? "High" : uniCount >= 1 ? "Moderate" : "Low",
                  explanation: uniCount >= 2
                    ? "Multiple universities drive term-time and graduation demand"
                    : uniCount >= 1
                      ? "Nearby university supports seasonal student demand"
                      : "No universities nearby for student-related stays",
                },
              ];

              return (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {categories.map((cat) => (
                    <Card key={cat.name}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <cat.icon className="h-4 w-4 text-primary" />
                          <p className="text-sm font-semibold text-foreground leading-tight">
                            {cat.name}
                          </p>
                        </div>
                        <Badge className={`mb-2 ${scoreColor(cat.score)}`}>
                          {cat.score}
                        </Badge>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {cat.explanation}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}

            {/* Events section */}
            <div className="mt-6">
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

              {r.nearbyEvents.events.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {r.nearbyEvents.events.slice(0, 6).map((event, i) => (
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
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 8: Direct Booking Potential
              ══════════════════════════════════════════════════════════ */}
          <section id="bookings" ref={setSectionRef("bookings")} className="mb-12">
            <SectionHeading
              icon={Target}
              title="Direct Booking Potential"
              subtitle="Assessment of your property's ability to attract direct bookings over time"
            />

            {/* Score card */}
            <Card className="mb-6">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-center sm:gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Direct Booking Score
                  </p>
                  <p className={`text-5xl font-bold ${bookingRatingColor}`}>
                    {bookingScore}
                    <span className="text-lg font-normal text-muted-foreground">/100</span>
                  </p>
                </div>
                <Badge className={`text-base px-4 py-1.5 ${
                  bookingScore >= 60 ? "bg-success text-success-foreground" : bookingScore >= 40 ? "bg-warning text-warning-foreground" : "bg-destructive/10 text-destructive"
                }`}>
                  {bookingRating}
                </Badge>
              </CardContent>
            </Card>

            {/* Contributing factors */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Contributing Factors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bookingFactors.map((factor) => (
                    <div key={factor.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{factor.label}</span>
                        <span className="text-sm font-semibold">
                          {factor.score}/{factor.max}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${factor.score >= factor.max * 0.7 ? "bg-success" : factor.score >= factor.max * 0.4 ? "bg-warning" : "bg-destructive/60"}`}
                          style={{ width: `${(factor.score / factor.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Building direct booking relationships takes time. Stayful focuses on converting platform guests into repeat direct customers, reducing platform fees from 15% to near-zero on direct bookings. By year 3, properties typically achieve 30-50% direct bookings, significantly boosting profitability.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 9: Risk Profile
              ══════════════════════════════════════════════════════════ */}
          <section id="risk" ref={setSectionRef("risk")} className="mb-12">
            <SectionHeading
              icon={AlertTriangle}
              title="Risk Profile"
              subtitle="Comprehensive risk assessment across financial, operational, and compliance dimensions"
            />

            {/* Overall risk - /100 scale */}
            <Card className="mb-6">
              <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:justify-center sm:gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Overall Risk Score
                  </p>
                  <p className={`text-4xl font-bold ${riskTextColor(v.riskLevel)}`}>
                    {risk.overallScore * 10}
                    <span className="text-lg font-normal text-muted-foreground">
                      /100
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
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm">{r.label}</span>
                          <span className="text-xs font-semibold">{riskToScore(r.level)}/100</span>
                        </div>
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
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm">{r.label}</span>
                          <span className="text-xs font-semibold">{riskToScore(r.level)}/100</span>
                        </div>
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
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm">{r.label}</span>
                          <span className="text-xs font-semibold">{riskToScore(r.level)}/100</span>
                        </div>
                        <Badge className={riskColor(r.level)}>{r.level}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-xs text-muted-foreground text-center">
              Risk scores are estimates based on available market data and location analysis. Individual circumstances may vary. We recommend discussing your specific situation with a Stayful advisor.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 10: Data Sources & Methodology
              ══════════════════════════════════════════════════════════ */}
          <section id="data-sources" ref={setSectionRef("data-sources")} className="mb-12">
            <SectionHeading
              icon={Database}
              title="Data Sources & Methodology"
              subtitle="How we calculate our estimates and where the data comes from"
            />

            <Card className="mb-6">
              <CardContent className="py-6">
                <h3 className="text-sm font-bold text-foreground mb-2">Our Methodology</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Our property analysis combines data from multiple industry-leading sources to provide accurate revenue estimates. We analyse comparable properties in your area, local demand drivers, seasonal patterns, and market trends. Revenue projections account for platform fees (15%), property management (15%), and cleaning/laundry costs (18%), totalling 48% in operating expenses. Long-term let comparisons use a 10% letting agent fee. All figures are based on current market data and may vary based on property presentation, pricing strategy, and market conditions.
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: BarChart3,
                  title: "Airbtics",
                  desc: "Short-term rental market analytics providing comparable property data, occupancy rates, and revenue estimates.",
                  stat: `${r.shortLet.activeListings} active listings analysed`,
                },
                {
                  icon: Home,
                  title: "PropertyData",
                  desc: "UK property market intelligence for long-term rental valuations and comparable rent analysis.",
                  stat: `${r.longLet.comparables.length} rental comparables found`,
                },
                {
                  icon: MapPin,
                  title: "Google Places",
                  desc: "Location intelligence for nearby amenities, hospitals, universities, and transport links.",
                  stat: `${demandCategories.reduce((s, c) => s + c.items.length, 0)} demand drivers identified`,
                },
                {
                  icon: Ticket,
                  title: "Ticketmaster",
                  desc: "Event data for upcoming concerts, sports, and entertainment driving booking demand.",
                  stat: `${r.nearbyEvents.totalEvents} upcoming events found`,
                },
                {
                  icon: Building2,
                  title: "OpenRent",
                  desc: "UK rental market platform providing additional long-term let comparable data.",
                  stat: "Market rent benchmarking",
                },
              ].map((source) => (
                <Card key={source.title}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <source.icon className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold text-foreground">{source.title}</p>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground mb-2">
                      {source.desc}
                    </p>
                    <Badge className="bg-primary/10 text-primary">{source.stat}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="mt-6 border-l-4 border-l-warning">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Important Disclaimer</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      All revenue projections and financial estimates are based on current market data and historical trends. Actual results may vary based on property condition, local regulations, market changes, and management quality. These estimates should not be considered guaranteed income. We recommend consulting with a tax professional regarding your specific financial situation.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Section 11: Growth (Direct Booking Funnel)
              ══════════════════════════════════════════════════════════ */}
          <section id="growth" ref={setSectionRef("growth")} className="mb-12">
            <SectionHeading
              icon={Rocket}
              title="Our Plan for Profitability"
              subtitle="How Stayful builds a sustainable, profitable short-let operation for your property"
            />

            {/* 36-month projection stats */}
            <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Direct Bookings</p>
                  <p className="mt-1 text-2xl font-bold text-success">50%</p>
                  <p className="text-[10px] text-muted-foreground">by Month 36</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Repeat Customers</p>
                  <p className="mt-1 text-2xl font-bold text-primary">126</p>
                  <p className="text-[10px] text-muted-foreground">built over 3 years</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Platform Fee Savings</p>
                  <p className="mt-1 text-2xl font-bold text-success">15%</p>
                  <p className="text-[10px] text-muted-foreground">eliminated on direct</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Extra Monthly Profit</p>
                  <p className="mt-1 text-2xl font-bold text-success">+{gbp(y3ExtraMonthlyProfit)}</p>
                  <p className="text-[10px] text-muted-foreground">by Year 3</p>
                </CardContent>
              </Card>
            </div>

            {/* Desktop: horizontal flow */}
            <div className="hidden md:block">
              <div className="flex items-start justify-between">
                {[
                  {
                    icon: Rocket,
                    title: "Momentum",
                    desc: "Launch on Airbnb and Booking.com to build early demand, bookings and reviews",
                  },
                  {
                    icon: BarChart3,
                    title: "Data",
                    desc: "Learn which guest types, lengths of stay and price points perform best",
                  },
                  {
                    icon: RefreshCw,
                    title: "Direct Bookings",
                    desc: "Turn repeat guests into lower-cost direct customers",
                  },
                  {
                    icon: TrendingUp,
                    title: "Expand",
                    desc: "Benefit from Stayful's wider guest network and more repeat opportunities",
                  },
                ].map((step, i, arr) => (
                  <div key={step.title} className="flex flex-1 items-start">
                    <Card className="flex-1">
                      <CardContent className="flex flex-col items-center px-4 py-6 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          <step.icon className="h-6 w-6 text-primary" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-foreground">
                          {step.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {step.desc}
                        </p>
                      </CardContent>
                    </Card>
                    {i < arr.length - 1 && (
                      <div className="flex shrink-0 items-center self-center px-1 pt-2">
                        <ChevronRight className="h-5 w-5 text-primary/50" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: vertical flow */}
            <div className="space-y-3 md:hidden">
              {[
                {
                  icon: Rocket,
                  title: "Momentum",
                  desc: "Launch on Airbnb and Booking.com to build early demand, bookings and reviews",
                },
                {
                  icon: BarChart3,
                  title: "Data",
                  desc: "Learn which guest types, lengths of stay and price points perform best",
                },
                {
                  icon: RefreshCw,
                  title: "Direct Bookings",
                  desc: "Turn repeat guests into lower-cost direct customers",
                },
                {
                  icon: TrendingUp,
                  title: "Expand",
                  desc: "Benefit from Stayful's wider guest network and more repeat opportunities",
                },
              ].map((step) => (
                <Card key={step.title}>
                  <CardContent className="flex items-start gap-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {step.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Result callout */}
            <Card className="mt-4 border-l-4 border-l-primary">
              <CardContent className="py-4">
                <p className="text-sm font-semibold text-foreground">
                  Result:{" "}
                  <span className="font-normal text-muted-foreground">
                    a higher share of profitable, repeat and lower-friction bookings.
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* Revenue Growth Timeline */}
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Income Growth Timeline
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Year 1 */}
                <Card className="border-muted">
                  <CardContent className="pt-4 pb-4">
                    <Badge className="mb-2 bg-muted text-muted-foreground">
                      Year 1
                    </Badge>
                    <p className="text-sm font-bold text-foreground">
                      Platform-Led
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Bookings primarily through Airbnb &amp; Booking.com. Building
                      reviews and data.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px]">
                      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="bg-muted-foreground/40" style={{ width: "95%" }} />
                        <div className="bg-success/40" style={{ width: "5%" }} />
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        ~5% direct
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-foreground">
                      Est. Net: {gbp(stlNetAnnual)}/yr
                    </p>
                  </CardContent>
                </Card>

                {/* Year 2 */}
                <Card className="border-warning/30">
                  <CardContent className="pt-4 pb-4">
                    <Badge className="mb-2 bg-warning/20 text-warning">
                      Year 2
                    </Badge>
                    <p className="text-sm font-bold text-foreground">
                      Repeat &amp; Direct
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Growing repeat guest base. ~20% of bookings direct. Lower
                      platform fees.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px]">
                      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="bg-muted-foreground/40" style={{ width: "80%" }} />
                        <div className="bg-warning" style={{ width: "20%" }} />
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        ~20% direct
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-foreground">
                      Est. Net: {gbp(Math.round(stlNetAnnual + grossAnnual * 0.20 * 0.15))}/yr
                    </p>
                  </CardContent>
                </Card>

                {/* Year 3+ */}
                <Card className="border-success/30">
                  <CardContent className="pt-4 pb-4">
                    <Badge className="mb-2 bg-success/20 text-success">
                      Year 3+
                    </Badge>
                    <p className="text-sm font-bold text-foreground">
                      Mature Operation
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      50%+ direct bookings. Stronger margins. More stability and
                      control.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px]">
                      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="bg-muted-foreground/40" style={{ width: "50%" }} />
                        <div className="bg-success" style={{ width: "50%" }} />
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        ~50% direct
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-success">
                      Est. Net: {gbp(Math.round(stlNetAnnual + grossAnnual * 0.50 * 0.15))}/yr
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              Post-Tab Sections (What Stayful Manages, Protection, etc.)
              ══════════════════════════════════════════════════════════ */}

          {/* ── What Stayful Manages ────────────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={Star}
              title="What Stayful Manages"
              subtitle="A clear breakdown of responsibilities between Stayful and you"
            />

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Left column: Stayful Handles */}
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
                      "Cleaning & Laundry",
                      "Maintenance",
                      "Guest Communication",
                      "Key Management",
                      "Direct Bookings",
                      "Dynamic Pricing",
                    ].map((text) => (
                      <li key={text} className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        <span className="text-sm">{text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Center column: What's Included */}
              <Card className="bg-muted/40 ring-1 ring-primary/20">
                <CardHeader>
                  <div className="flex flex-col items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      Included in your 15% + VAT
                    </Badge>
                    <CardTitle className="text-base text-center">
                      What&apos;s Included
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { icon: Layers, text: "Central Channel Manager" },
                      { icon: MessageSquare, text: "Slack Messaging" },
                      { icon: FileText, text: "Detailed Monthly Reports" },
                      { icon: Phone, text: "Quarterly Performance Calls" },
                      { icon: BookOpen, text: "Monthly Market Newsletter" },
                    ].map((item) => (
                      <div
                        key={item.text}
                        className="flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-border"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <item.icon className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Right column: Landlord Handles */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                    <Home className="h-4 w-4" />
                    Landlord Handles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      "Utilities (smart thermostat advised)",
                      "Mortgage Payments",
                      "WIFI & Council Tax (can be free)",
                    ].map((text) => (
                      <li key={text} className="flex items-center gap-3">
                        <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm">{text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Guest Protection ──────────────────────────────── */}
          <section className="mb-10">
            <SectionHeading
              icon={ShieldCheck}
              title="How We Protect Your Property"
              subtitle="Stayful's comprehensive guest vetting and property protection measures"
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                {
                  icon: Shield,
                  title: "\u00A3200 security deposit",
                },
                {
                  icon: ClipboardCheck,
                  title: "ID checks for every guest",
                },
                {
                  icon: ShieldCheck,
                  title: "Insurance up to \u00A3100,000 per stay",
                },
                {
                  icon: Eye,
                  title: "Quarterly property inspections",
                },
                {
                  icon: Users,
                  title: "30% direct bookings",
                },
              ].map((item) => (
                <Card key={item.title} className="text-center">
                  <CardContent className="flex flex-col items-center px-3 py-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground" style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}>
                      <item.icon className="h-7 w-7" />
                    </div>
                    <p className="mt-3 text-xs font-semibold leading-tight text-foreground">
                      {item.title}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Onboarding Timeline ──────────────────────────── */}
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
                          title: "Contract Signed",
                          desc: "Onboarding form filled, answer what you can, we'll work together on the rest",
                          icon: FileText,
                        },
                        {
                          step: "2",
                          title: "Kick Off Call",
                          desc: "Discuss specific plans and create a Slack channel for communication",
                          icon: Phone,
                        },
                        {
                          step: "3",
                          title: "Furnishing & Photos",
                          desc: "End-to-end service by Stayful, or DIY with our free setup guide",
                          icon: Camera,
                        },
                        {
                          step: "4",
                          title: "Inspection & Snagging",
                          desc: "Our team visits with a detailed snagging list before going live",
                          icon: ClipboardCheck,
                        },
                        {
                          step: "5",
                          title: "Go Live",
                          desc: "Listing setup on all platforms and you're live",
                          icon: Zap,
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
                          <p className="mt-0.5 max-w-[140px] text-[10px] leading-tight text-muted-foreground">
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
                        title: "Contract Signed",
                        desc: "Onboarding form filled, answer what you can, we'll work together on the rest",
                        icon: FileText,
                      },
                      {
                        step: "2",
                        title: "Kick Off Call",
                        desc: "Discuss specific plans and create a Slack channel for communication",
                        icon: Phone,
                      },
                      {
                        step: "3",
                        title: "Furnishing & Photos",
                        desc: "End-to-end service by Stayful, or DIY with our free setup guide",
                        icon: Camera,
                      },
                      {
                        step: "4",
                        title: "Inspection & Snagging",
                        desc: "Our team visits with a detailed snagging list before going live",
                        icon: ClipboardCheck,
                      },
                      {
                        step: "5",
                        title: "Go Live",
                        desc: "Listing setup on all platforms and you're live",
                        icon: Zap,
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

                {/* Tagline */}
                <div className="mt-6 text-center">
                  <Badge className="bg-primary/10 text-primary text-sm font-semibold px-4 py-1.5">
                    3 weeks from kick off to go live
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Footer CTA ────────────────────────────────────── */}
          <section className="mb-10">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <h2 className="text-2xl font-bold">Ready to Get Started?</h2>
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
                      window.open(
                        "https://calendly.com/zac-stayful/call",
                        "_blank"
                      )
                    }
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Book a Call
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                    onClick={() =>
                      window.open(
                        "/stayful-management-agreement.pdf",
                        "_blank"
                      )
                    }
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View Management Agreement
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Footer */}
        <footer className="border-t border-border bg-muted/30 py-8 pb-24">
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

        {/* ── Sticky Footer CTA Bar ──────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <p className="hidden text-sm font-medium text-foreground sm:block">
              Want an expert opinion on these results?
            </p>
            <p className="text-sm font-medium text-foreground sm:hidden">
              Need expert advice?
            </p>
            <Button
              size="sm"
              onClick={() =>
                window.open(
                  "https://calendly.com/zac-stayful/call",
                  "_blank"
                )
              }
            >
              <Calendar className="mr-1.5 h-4 w-4" />
              Book Expert Risk Analysis
            </Button>
          </div>
        </div>
      </main>
      </>
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

                {/* Advanced Options */}
                <div className="space-y-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
                      aria-hidden="true"
                    />
                    Advanced Options
                  </button>

                  {showAdvanced && (
                    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="space-y-2">
                        <Label htmlFor="propertyType" className="flex items-center gap-2">
                          <Home className="h-4 w-4" aria-hidden="true" />
                          Property Type
                        </Label>
                        <select
                          id="propertyType"
                          value={propertyType}
                          onChange={(e) => setPropertyType(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="Flat">Flat</option>
                          <option value="Terraced House">Terraced House</option>
                          <option value="Semi-Detached House">Semi-Detached House</option>
                          <option value="Detached House">Detached House</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="monthlyMortgage" className="flex items-center gap-2">
                            Monthly Mortgage
                          </Label>
                          <Input
                            type="number"
                            id="monthlyMortgage"
                            min={0}
                            placeholder="e.g. 800"
                            value={monthlyMortgage}
                            onChange={(e) => setMonthlyMortgage(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="monthlyBills" className="flex items-center gap-2">
                            Monthly Bills
                          </Label>
                          <Input
                            type="number"
                            id="monthlyBills"
                            min={0}
                            placeholder="e.g. 250"
                            value={monthlyBills}
                            onChange={(e) => setMonthlyBills(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
            Data sourced from Airbtics, PropertyData, Google Places, Ticketmaster,
            and public market research.
          </p>
        </div>
      </footer>
    </main>
  );
}
