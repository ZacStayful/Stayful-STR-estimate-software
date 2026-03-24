"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  X,
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldCheck,
  Heart,
  GraduationCap,
  Plane,
  TrainFront,
  Bus,
  TrainTrack,
  Phone,
  Rocket,
  Eye,
  Wrench,
  MessageSquare,
  Camera,
  ClipboardCheck,
  LineChart,
  BookOpen,
  Layers,
  RefreshCw,
  Star,
  Globe,
  Zap,
  Clock,
  Home,
  Wifi,
  Database,
  Calculator,
  CheckCircle2,
  Users,
  BedDouble,
  BarChart3,
  Target,
  Sparkles,
} from "lucide-react";
import type { AnalysisResult, RiskLevel } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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

const TOTAL_SLIDES = 14;
const GREEN = "#5d8156";
const GREEN_LIGHT = "#e8f0e6";
const GREEN_BG = "#f5f8f4";

// ─── Component ───────────────────────────────────────────────────

interface PresentationProps {
  data: AnalysisResult;
  onClose: () => void;
}

export default function Presentation({ data, onClose }: PresentationProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const r = data;
  const f = r.financials;

  // Computed values
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
  const revDifferencePct = ltlNetAnnual > 0 ? Math.round((revDifference / ltlNetAnnual) * 100) : 0;

  // Monthly net
  const stlMonthlyNet = r.shortLet.monthlyRevenue.map((rev) => Math.round(rev * 0.52));
  const ltlMonthlyNet = Math.round(ltlNetAnnual / 12);

  // Peak months
  const peakMonthIndices = stlMonthlyNet
    .map((net, i) => ({ net, i }))
    .filter((m) => m.net > ltlMonthlyNet)
    .map((m) => m.i);

  // Demand drivers
  const hospitals = r.demandDrivers.hospitals.length;
  const universities = r.demandDrivers.universities.length;
  const totalTransport = r.demandDrivers.trainStations.length + r.demandDrivers.busStations.length + r.demandDrivers.subwayStations.length;
  const totalEvents = r.nearbyEvents.totalEvents;
  const demandDriverCount = [hospitals > 0, universities > 0, totalTransport > 0, totalEvents > 0].filter(Boolean).length;

  // Booking score
  let bookingScore = 15; // baseline
  if (hospitals > 0) bookingScore += 15;
  if (universities > 0) bookingScore += 15;
  bookingScore += totalTransport >= 3 ? 20 : totalTransport >= 1 ? 12 : 0;
  bookingScore += totalEvents >= 100 ? 25 : totalEvents >= 50 ? 15 : totalEvents > 0 ? 5 : 0;
  bookingScore += demandDriverCount >= 3 ? 10 : demandDriverCount >= 2 ? 5 : 0;

  // Risk scores
  const riskToScore = (level: RiskLevel): number => {
    if (level === "low") return 85;
    if (level === "moderate") return 55;
    return 25;
  };
  const revenueConsistency = Math.round((riskToScore(r.risk.incomeVolatility) + riskToScore(r.risk.seasonality)) / 2);
  const longTermComparison = revDifference >= 0 ? Math.min(95, 60 + Math.round(revDifferencePct * 0.3)) : Math.max(15, 50 + Math.round(revDifferencePct * 0.3));
  const marketDemand = Math.round((riskToScore(r.risk.locationDemand) + riskToScore(r.risk.competition)) / 2);

  // Navigation
  const goNext = useCallback(() => {
    if (currentSlide < TOTAL_SLIDES - 1) {
      setDirection("right");
      setCurrentSlide((s) => s + 1);
    }
  }, [currentSlide]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection("left");
      setCurrentSlide((s) => s - 1);
    }
  }, [currentSlide]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  // Clear transition direction after animation
  useEffect(() => {
    if (direction) {
      const t = setTimeout(() => setDirection(null), 300);
      return () => clearTimeout(t);
    }
  }, [direction, currentSlide]);

  // Demand drivers list for slide 6
  const allDemandDrivers = [
    ...r.demandDrivers.hospitals.map((a) => ({ ...a, category: "Hospital", icon: Heart })),
    ...r.demandDrivers.universities.map((a) => ({ ...a, category: "University", icon: GraduationCap })),
    ...r.demandDrivers.airports.map((a) => ({ ...a, category: "Airport", icon: Plane })),
    ...r.demandDrivers.trainStations.map((a) => ({ ...a, category: "Train Station", icon: TrainFront })),
    ...r.demandDrivers.busStations.map((a) => ({ ...a, category: "Bus Station", icon: Bus })),
    ...r.demandDrivers.subwayStations.map((a) => ({ ...a, category: "Metro", icon: TrainTrack })),
  ].sort((a, b) => a.distance - b.distance).slice(0, 8);

  // Slide rendering
  const renderSlide = () => {
    switch (currentSlide) {
      // ─── Slide 1: Title ────────────────────────────────────────
      case 0:
        return (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-8 rounded-full p-4" style={{ backgroundColor: GREEN_LIGHT }}>
              <Home className="h-12 w-12" style={{ color: GREEN }} />
            </div>
            <h1 className="mb-4 text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Property Income Analysis
            </h1>
            <p className="mb-6 text-2xl font-medium text-gray-700 sm:text-3xl">
              {r.property.address}
            </p>
            <p className="mb-8 text-xl text-gray-500">
              {r.property.postcode}
            </p>
            <div className="flex items-center gap-4 text-lg text-gray-600">
              <span className="flex items-center gap-2">
                <BedDouble className="h-5 w-5" style={{ color: GREEN }} />
                {r.property.bedrooms} Bedrooms
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5" style={{ color: GREEN }} />
                {r.property.guests} Guests
              </span>
            </div>
          </div>
        );

      // ─── Slide 2: Executive Summary ────────────────────────────
      case 1:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Executive Summary</h2>
            <p className="mb-10 text-center text-lg text-gray-500">Financial overview at a glance</p>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
              <StatCard
                label="Gross Annual Revenue"
                value={gbp(grossAnnual)}
                sub="Short-term rental potential"
                color={GREEN}
              />
              <StatCard
                label="Net Annual Revenue"
                value={gbp(stlNetAnnual)}
                sub="After 48% operating costs"
                color={GREEN}
              />
              <StatCard
                label="Long-Term Let (Net)"
                value={gbp(ltlNetAnnual)}
                sub="After 10% agent fees"
                color="#6b7280"
              />
              <StatCard
                label="Additional Income"
                value={`${revDifference >= 0 ? "+" : ""}${gbp(revDifference)}`}
                sub={`${Math.abs(revDifferencePct)}% ${revDifference >= 0 ? "more" : "less"} than long-let`}
                color={revDifference >= 0 ? GREEN : "#ef4444"}
              />
            </div>
          </div>
        );

      // ─── Slide 3: Market Analysis ──────────────────────────────
      case 2:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Market Analysis</h2>
            <p className="mb-10 text-center text-lg text-gray-500">Based on comparable Airbnb properties nearby</p>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4">
              <MarketStat label="Avg Nightly Rate" value={gbp(r.shortLet.averageDailyRate)} />
              <MarketStat label="Avg Occupancy" value={pct(r.shortLet.occupancyRate)} />
              <MarketStat label="Avg Rating" value="4.5" />
              <MarketStat label="Properties Analysed" value={r.shortLet.activeListings > 0 ? String(r.shortLet.activeListings) : "Market data"} />
            </div>
            <p className="mt-10 text-center text-sm text-gray-400">
              Data sourced from Airbtics, AirDNA, and live Airbnb listings
            </p>
          </div>
        );

      // ─── Slide 4: Operating Cost Breakdown ─────────────────────
      case 3:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Operating Cost Breakdown</h2>
            <p className="mb-10 text-center text-lg text-gray-500">How your gross revenue is allocated</p>
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <CostBar label="Platform Fees (Airbnb/Booking.com)" pct={15} amount={platformFees} color="#f59e0b" />
              <CostBar label="Management Fees (Stayful)" pct={15} amount={managementFees} color={GREEN} />
              <CostBar label="Cleaning & Laundry" pct={18} amount={cleaningLaundry} color="#6366f1" />
              <div className="mt-4 border-t-2 border-gray-200 pt-4">
                <CostBar label="Total Operating Costs" pct={48} amount={totalOperatingCosts} color="#374151" />
              </div>
            </div>
            <div className="mt-8 rounded-xl p-4 text-center" style={{ backgroundColor: GREEN_LIGHT }}>
              <p className="text-lg font-semibold text-gray-700">
                Your Net Annual Revenue: <span style={{ color: GREEN }} className="text-2xl font-bold">{gbp(stlNetAnnual)}</span>
              </p>
            </div>
          </div>
        );

      // ─── Slide 5: Seasonal Performance ─────────────────────────
      case 4:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Seasonal Performance</h2>
            <p className="mb-6 text-center text-lg text-gray-500">Monthly net revenue after operating costs</p>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-medium text-gray-500">Peak months:</span>
              {peakMonthIndices.map((i) => (
                <span
                  key={i}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-white"
                  style={{ backgroundColor: GREEN }}
                >
                  {MONTHS[i]}
                </span>
              ))}
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {MONTHS.map((month, i) => {
                const isPeak = peakMonthIndices.includes(i);
                return (
                  <div
                    key={month}
                    className="rounded-xl border-2 p-3 text-center"
                    style={{
                      borderColor: isPeak ? GREEN : "#e5e7eb",
                      backgroundColor: isPeak ? GREEN_LIGHT : "#fff",
                    }}
                  >
                    <p className="text-xs font-semibold text-gray-500">{month}</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: isPeak ? GREEN : "#374151" }}>
                      {gbp(stlMonthlyNet[i])}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-center text-sm text-gray-400">
              Peak months typically see 20-40% higher revenue than off-peak periods
            </p>
          </div>
        );

      // ─── Slide 6: Local Demand Drivers ─────────────────────────
      case 5:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Local Demand Drivers</h2>
            <p className="mb-8 text-center text-lg text-gray-500">Why guests will book your property</p>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
              {allDemandDrivers.map((driver, i) => {
                const Icon = driver.icon;
                return (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="rounded-lg p-2" style={{ backgroundColor: GREEN_LIGHT }}>
                      <Icon className="h-5 w-5" style={{ color: GREEN }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{driver.name}</p>
                      <p className="text-sm text-gray-500">{driver.category} &middot; {(driver.distance / 1000).toFixed(1)} km away</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {allDemandDrivers.length === 0 && (
              <p className="mt-4 text-center text-gray-400">No specific demand drivers found nearby</p>
            )}
            <div className="mt-8 text-center">
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>
                <Target className="h-4 w-4" />
                Direct Booking Potential Score: {bookingScore}/100
              </span>
            </div>
          </div>
        );

      // ─── Slide 7: Risk Assessment ──────────────────────────────
      case 6:
        return (
          <div className="flex h-full flex-col items-center justify-center">
            <h2 className="mb-8 text-center text-4xl font-bold text-gray-900">Risk Assessment</h2>
            <div
              className="mb-8 flex h-40 w-40 items-center justify-center rounded-full border-8"
              style={{ borderColor: r.risk.overallScore >= 60 ? GREEN : r.risk.overallScore >= 40 ? "#f59e0b" : "#ef4444" }}
            >
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-900">{r.risk.overallScore}</p>
                <p className="text-sm text-gray-500">out of 100</p>
              </div>
            </div>
            <div className="mx-auto w-full max-w-2xl space-y-5">
              <RiskBar label="Revenue Consistency" score={revenueConsistency} />
              <RiskBar label="Long-Term Comparison" score={longTermComparison} />
              <RiskBar label="Market Demand" score={marketDemand} />
            </div>
            <p className="mt-8 max-w-xl text-center text-sm text-gray-500">
              {r.risk.overallScore >= 60
                ? "This property shows strong potential with manageable risk factors."
                : r.risk.overallScore >= 40
                  ? "This property has moderate risk. Careful pricing and management will be key."
                  : "Higher risk profile. A detailed strategy is recommended before proceeding."}
            </p>
          </div>
        );

      // ─── Slide 8: Our Plan for Profitability ──────────────────
      case 7:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Our Plan for Profitability</h2>
            <p className="mb-10 text-center text-lg text-gray-500">The Stayful direct booking funnel</p>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { num: 1, title: "Momentum", desc: "Build establishment on Airbnb & Booking.com over 3-6 months", icon: Rocket },
                { num: 2, title: "Data", desc: "Build a customer database based on booking patterns", icon: Database },
                { num: 3, title: "Direct Bookings", desc: "Convert repeat guests into direct customers", icon: Target },
                { num: 4, title: "Expand", desc: "Access our network of direct booking opportunities", icon: Globe },
              ].map((step) => (
                <div key={step.num} className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    {step.num}
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-500">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-xl p-4 text-center" style={{ backgroundColor: GREEN_LIGHT }}>
              <p className="text-base font-semibold" style={{ color: GREEN }}>
                30% of our bookings are now direct customers — saving platform fees
              </p>
            </div>
          </div>
        );

      // ─── Slide 9: How We Protect Your Property ────────────────
      case 8:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">How We Protect Your Property</h2>
            <p className="mb-10 text-center text-lg text-gray-500">Guest vetting and property protection</p>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { value: "£200", label: "Security Deposit", icon: Shield },
                { value: "30%", label: "Direct Customers", icon: Users },
                { value: "Quarterly", label: "Property Inspections", icon: ClipboardCheck },
                { value: "£100K", label: "Guest Insurance", icon: ShieldCheck },
                { value: "100%", label: "ID Verified", icon: Eye },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
                  <div className="mb-3 rounded-full p-3" style={{ backgroundColor: GREEN_LIGHT }}>
                    <item.icon className="h-6 w-6" style={{ color: GREEN }} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                  <p className="mt-1 text-sm text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-base text-gray-500">
              Every guest is ID checked and insured up to £100,000
            </p>
          </div>
        );

      // ─── Slide 10: Responsibilities ───────────────────────────
      case 9:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Landlord & Stayful Responsibilities</h2>
            <p className="mb-10 text-center text-lg text-gray-500">A clear division of duties</p>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2">
              <div className="rounded-2xl border-2 p-6" style={{ borderColor: GREEN, backgroundColor: GREEN_LIGHT }}>
                <h3 className="mb-4 text-xl font-bold" style={{ color: GREEN }}>Stayful</h3>
                <ul className="space-y-3">
                  {[
                    { icon: Sparkles, text: "Cleaning & Laundry" },
                    { icon: Wrench, text: "Maintenance" },
                    { icon: MessageSquare, text: "Guest Communication" },
                    { icon: Home, text: "Key Management" },
                    { icon: TrendingUp, text: "Dynamic Pricing" },
                    { icon: Target, text: "Direct Booking Management" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 flex-shrink-0" style={{ color: GREEN }} />
                      <span className="font-medium text-gray-800">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-6">
                <h3 className="mb-4 text-xl font-bold text-gray-500">Landlord</h3>
                <ul className="space-y-3">
                  {[
                    { icon: Zap, text: "Utilities" },
                    { icon: Calculator, text: "Mortgage" },
                    { icon: Wifi, text: "WiFi & Council Tax", note: "Council tax can be exempt for STL" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <item.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                      <div>
                        <span className="font-medium text-gray-600">{item.text}</span>
                        {item.note && <p className="text-xs text-gray-400">{item.note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );

      // ─── Slide 11: What's Included ────────────────────────────
      case 10:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">What&apos;s Included in Stayful Service</h2>
            <div className="mb-8 text-center">
              <span className="inline-block rounded-full px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: GREEN }}>
                Only 15% + VAT
              </span>
            </div>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Layers, title: "Central Channel Manager", desc: "Manage all platforms from one place" },
                { icon: MessageSquare, title: "Slack Messaging", desc: "Real-time communication channel" },
                { icon: LineChart, title: "Monthly Property Reports", desc: "Detailed performance insights" },
                { icon: Phone, title: "Quarterly Performance Calls", desc: "Strategic review sessions" },
                { icon: BookOpen, title: "Market Report Newsletter", desc: "Stay ahead of market trends" },
                { icon: TrendingUp, title: "Dynamic Pricing", desc: "Maximise revenue automatically" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="rounded-lg p-2" style={{ backgroundColor: GREEN_LIGHT }}>
                    <item.icon className="h-5 w-5" style={{ color: GREEN }} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      // ─── Slide 12: Onboarding ─────────────────────────────────
      case 11:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Onboarding with Stayful</h2>
            <p className="mb-10 text-center text-lg text-gray-500">3 weeks from kick-off to go live</p>
            <div className="mx-auto max-w-3xl">
              {[
                { num: 1, title: "Contract Signed", desc: "Contract signed and onboarding form filled" },
                { num: 2, title: "Kick-Off Call", desc: "Discuss plans, create your Slack channel" },
                { num: 3, title: "Furnishing & Photos", desc: "End-to-end service or DIY with free setup guide" },
                { num: 4, title: "Inspection & Snagging", desc: "Team visits site with detailed checklist" },
                { num: 5, title: "Listing Setup", desc: "All platforms configured and optimised" },
                { num: 6, title: "Go Live!", desc: "Start receiving bookings" },
              ].map((step, i) => (
                <div key={step.num} className="flex items-start gap-4 pb-6">
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: GREEN }}
                    >
                      {step.num}
                    </div>
                    {i < 5 && <div className="mt-1 h-8 w-0.5" style={{ backgroundColor: GREEN, opacity: 0.3 }} />}
                  </div>
                  <div className="pt-1.5">
                    <p className="font-semibold text-gray-900">{step.title}</p>
                    <p className="text-sm text-gray-500">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      // ─── Slide 13: Why Choose Stayful? ────────────────────────
      case 12:
        return (
          <div className="flex h-full flex-col justify-center">
            <h2 className="mb-2 text-center text-4xl font-bold text-gray-900">Why Choose Stayful?</h2>
            <p className="mb-10 text-center text-lg text-gray-500">Your trusted property management partner</p>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: BarChart3, title: "Only 15% Management Fee", desc: "One of the lowest in the industry" },
                { icon: Globe, title: "Nationwide Coverage", desc: "We manage properties across the UK" },
                { icon: TrendingUp, title: "Dynamic Pricing", desc: "Maximise revenue with smart pricing" },
                { icon: CheckCircle2, title: "Full Service Management", desc: "Guests, cleaning, maintenance — all handled" },
                { icon: Clock, title: "24/7 Guest Support", desc: "Round-the-clock assistance for guests" },
                { icon: Star, title: "4.8 Star Google Rating", desc: "Trusted by property owners nationwide" },
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: GREEN_LIGHT }}>
                    <item.icon className="h-6 w-6" style={{ color: GREEN }} />
                  </div>
                  <p className="font-bold text-gray-900">{item.title}</p>
                  <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );

      // ─── Slide 14: Ready to Get Started? ──────────────────────
      case 13:
        return (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="mb-4 text-5xl font-bold text-gray-900">Ready to Get Started?</h2>
            <p className="mb-8 max-w-xl text-xl text-gray-500">
              Let Stayful help you maximise your property&apos;s income potential
            </p>
            <div className="mb-10 rounded-2xl border-2 px-10 py-6" style={{ borderColor: GREEN, backgroundColor: GREEN_LIGHT }}>
              <p className="text-sm font-medium text-gray-500">Potential</p>
              <p className="text-4xl font-bold" style={{ color: GREEN }}>
                {gbp(stlNetAnnual)}/year
              </p>
            </div>
            <button
              onClick={() => window.open("https://calendly.com/zac-stayful/call", "_blank")}
              className="mb-6 rounded-xl px-8 py-4 text-lg font-bold text-white shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: GREEN }}
            >
              Get Your Free Consultation
            </button>
            <p className="flex items-center gap-2 text-lg text-gray-500">
              <Phone className="h-5 w-5" style={{ color: GREEN }} />
              0113 479 0251
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: GREEN_BG }}>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
          Back to Report
        </button>
        <div className="text-sm font-medium text-gray-500">
          {currentSlide + 1} / {TOTAL_SLIDES}
        </div>
        <div className="w-24">
          <Image
            alt="Stayful"
            width={100}
            height={35}
            className="ml-auto h-7 w-auto"
            src="/images/stayful-logo.png"
          />
        </div>
      </div>

      {/* Slide content */}
      <div className="relative flex-1 overflow-y-auto">
        <div
          className="mx-auto h-full max-w-6xl px-6 py-8 transition-opacity duration-200 sm:px-10 sm:py-10"
          style={{ opacity: direction ? 0.5 : 1 }}
        >
          {renderSlide()}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <button
          onClick={goPrev}
          disabled={currentSlide === 0}
          className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > currentSlide ? "right" : "left");
                setCurrentSlide(i);
              }}
              className="h-2 w-2 rounded-full transition-all"
              style={{
                backgroundColor: i === currentSlide ? GREEN : "#d1d5db",
                transform: i === currentSlide ? "scale(1.4)" : "scale(1)",
              }}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={currentSlide === TOTAL_SLIDES - 1}
          className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-30"
          style={{ backgroundColor: GREEN }}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color }}>{value}</p>
      <p className="mt-1 text-sm text-gray-400">{sub}</p>
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: GREEN }}>{value}</p>
    </div>
  );
}

function CostBar({ label, pct, amount, color }: { label: string; pct: number; amount: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{pct}% &middot; {gbp(amount)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(pct / 48) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function RiskBar({ label, score }: { label: string; score: number }) {
  const color = score >= 65 ? GREEN : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
