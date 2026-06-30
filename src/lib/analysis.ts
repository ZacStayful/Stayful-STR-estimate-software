/**
 * Analysis calculator — financial projections, risk assessment, and verdict.
 */

import type {
  ShortLetData,
  LongLetData,
  DemandDrivers,
  FinancialSummary,
  RiskProfile,
  RiskLevel,
  PropertyVerdict,
  VerdictFit,
  Recommendation,
} from './types';

// ─── Default cost assumptions ────────────────────────────────────
// Short-let: 15% platform + 15% management + 18% cleaning = 48% total
const SHORT_LET_PLATFORM_FEES_RATE = 0.15;
const SHORT_LET_MANAGEMENT_FEE_RATE = 0.15;
const SHORT_LET_CLEANING_RATE = 0.18;
// Long-let: 10% agent fees
const LONG_LET_AGENT_FEE_RATE = 0.10;

// ─── Financial Calculator ────────────────────────────────────────

export function calculateFinancials(
  shortLet: ShortLetData,
  longLet: LongLetData,
): FinancialSummary {
  // ── Short-let ──
  // Total operating costs: 15% platform + 15% management + 18% cleaning = 48%
  // Net = gross * 0.52
  const shortLetGrossAnnual = shortLet.annualRevenue;
  const shortLetNetAnnual = shortLetGrossAnnual * 0.52;

  // ── Long-let ──
  // Agent fees: 10% of gross
  // Net = gross * 0.90
  const longLetGrossAnnual = longLet.monthlyRent * 12;
  const longLetNetAnnual = longLetGrossAnnual * 0.90;

  // ── Differences ──
  const annualDifference = shortLetNetAnnual - longLetNetAnnual;
  const monthlyDifference = Math.round(annualDifference / 12);

  // ── Break-even occupancy ──
  // At what occupancy rate does the short-let net income equal the long-let net income?
  // Revenue at occupancy X = ADR * 365 * X
  // Net short-let at X = ADR * 365 * X * 0.52
  // Set equal to longLetNetAnnual and solve for X
  const adr = shortLet.averageDailyRate;
  let breakEvenOccupancy = 0;

  if (adr > 0) {
    const revenueMultiplier = adr * 365 * 0.52;
    breakEvenOccupancy = longLetNetAnnual / revenueMultiplier;
    // Clamp between 0 and 1
    breakEvenOccupancy = Math.max(0, Math.min(1, breakEvenOccupancy));
    // Round to 2dp
    breakEvenOccupancy = Math.round(breakEvenOccupancy * 100) / 100;
  }

  return {
    shortLetGrossAnnual: Math.round(shortLetGrossAnnual),
    shortLetNetAnnual: Math.round(shortLetNetAnnual),
    longLetGrossAnnual: Math.round(longLetGrossAnnual),
    longLetNetAnnual: Math.round(longLetNetAnnual),
    monthlyDifference,
    annualDifference: Math.round(annualDifference),
    breakEvenOccupancy,
  };
}

// ─── Qualification Decision ──────────────────────────────────────
// After the STR gross income projection runs, decide whether short-let or
// long-let is the better option for this specific property. The figures here
// are deliberately more conservative ("true net") than the headline numbers
// shown on the detailed report, so the decision reflects real take-home.

const TRUE_NET_PCT = 0.44;          // after platform 15%, mgmt 15%+VAT (18%), cleaning 18%, maintenance 5%
const FIXED_COSTS_ANNUAL = 5904;    // £450/mo bills + £42/mo software, x12
const LL_AGENT_FEE = 0.10;          // standard long-let management fee
const MARGIN_THRESHOLD = 0.50;      // uplift required to recommend short-let

/**
 * Core decision formula. Compares the true net short-let income against the
 * true net long-let income and recommends short-let only when the uplift
 * clears MARGIN_THRESHOLD (the extra work has to be worth it).
 */
export function getRecommendation(
  grossSTRAnnual: number,
  longLetMonthly: number,
): Pick<Recommendation, 'recommendation' | 'upliftPct' | 'trueSTRNet' | 'trueLLNet'> {
  const trueSTRNet = (grossSTRAnnual * TRUE_NET_PCT) - FIXED_COSTS_ANNUAL;
  const trueLLNet = (longLetMonthly * 12) * (1 - LL_AGENT_FEE);
  const upliftPct = (trueSTRNet - trueLLNet) / trueLLNet;
  return {
    recommendation: upliftPct >= MARGIN_THRESHOLD ? 'SHORT_LET' : 'LONG_LET',
    upliftPct,
    trueSTRNet,
    trueLLNet,
  };
}

/**
 * Fallback long-let rent estimator for when the landlord selects "Not sure".
 *
 * TODO: Wire this up to a real lookup — e.g. the PropertyData long-let
 * valuation already fetched during analysis, or a dedicated comparables
 * service keyed on postcode + bedrooms. Returns null for now, which signals
 * the caller to fall back to the PropertyData valuation so a decision can
 * still be produced.
 */
export function estimateLongLet(
  _postcode: string,
  _bedrooms: number,
): number | null {
  // Not yet implemented — see TODO above.
  return null;
}

// ─── Risk Assessment ─────────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score <= 1) return 'low';
  if (score <= 2) return 'moderate';
  return 'high';
}

export function assessRisk(
  shortLet: ShortLetData,
  longLet: LongLetData,
  amenities: DemandDrivers,
  events: { totalEvents: number },
): RiskProfile {
  const scores: Record<string, number> = {};

  // ── Income volatility ──
  // Higher occupancy = more stable income
  if (shortLet.occupancyRate >= 0.7) scores.incomeVolatility = 1;
  else if (shortLet.occupancyRate >= 0.5) scores.incomeVolatility = 2;
  else scores.incomeVolatility = 3;

  // ── Setup cost ──
  // Short-let always has meaningful setup costs (furnishing, photography, staging)
  scores.setupCost = 2;

  // ── Regulatory ──
  // UK short-let regulation is tightening; always moderate-to-high
  scores.regulatory = 2;

  // ── Guest damage ──
  // More guests capacity = higher risk of damage
  if (shortLet.averageDailyRate > 200) scores.guestDamage = 1; // premium properties attract careful guests
  else if (shortLet.averageDailyRate > 100) scores.guestDamage = 2;
  else scores.guestDamage = 3;

  // ── Seasonality ──
  // Analyse monthly revenue variance
  const monthlyValues = shortLet.monthlyRevenue.filter((v) => v > 0);
  if (monthlyValues.length >= 6) {
    const mean = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;
    const variance =
      monthlyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / monthlyValues.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // coefficient of variation
    if (cv < 0.15) scores.seasonality = 1;
    else if (cv < 0.35) scores.seasonality = 2;
    else scores.seasonality = 3;
  } else {
    scores.seasonality = 2; // unknown, assume moderate
  }

  // ── Platform dependency ──
  // Always moderate — most hosts rely heavily on Airbnb/Booking.com
  scores.platformDependency = 2;

  // ── Location demand ──
  // Score based on nearby amenities and events
  const totalAmenities =
    amenities.hospitals.length +
    amenities.universities.length +
    amenities.airports.length +
    amenities.trainStations.length +
    amenities.busStations.length +
    amenities.subwayStations.length;

  const hasGoodTransport =
    amenities.trainStations.length + amenities.busStations.length + amenities.subwayStations.length >= 2 ||
    amenities.airports.length >= 1;
  const hasDemandDrivers = amenities.hospitals.length >= 1 || amenities.universities.length >= 1;
  const hasEvents = events.totalEvents >= 10;

  let demandScore = 3; // default high risk (low demand)
  if (totalAmenities >= 8 && hasGoodTransport && hasDemandDrivers) demandScore = 1;
  else if (totalAmenities >= 4 && (hasGoodTransport || hasDemandDrivers || hasEvents)) demandScore = 2;
  scores.locationDemand = demandScore;

  // ── Competition ──
  // Based on active listings in the area
  if (shortLet.activeListings <= 50) scores.competition = 1;
  else if (shortLet.activeListings <= 200) scores.competition = 2;
  else scores.competition = 3;

  // ── Overall score (1–10 scale) ──
  const allScores = Object.values(scores);
  const rawAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  // Map 1–3 average to 1–10 scale
  const overallScore = Math.round(((rawAvg - 1) / 2) * 9 + 1);

  return {
    incomeVolatility: scoreToLevel(scores.incomeVolatility),
    setupCost: scoreToLevel(scores.setupCost),
    regulatory: scoreToLevel(scores.regulatory),
    guestDamage: scoreToLevel(scores.guestDamage),
    seasonality: scoreToLevel(scores.seasonality),
    platformDependency: scoreToLevel(scores.platformDependency),
    locationDemand: scoreToLevel(scores.locationDemand),
    competition: scoreToLevel(scores.competition),
    overallScore: Math.max(1, Math.min(10, overallScore)),
  };
}

// ─── Verdict Generator ───────────────────────────────────────────

export function generateVerdict(
  financials: FinancialSummary,
  risk: RiskProfile,
): PropertyVerdict {
  // Determine fit
  let fit: VerdictFit;

  const netAdvantagePercent =
    financials.longLetNetAnnual > 0
      ? financials.annualDifference / financials.longLetNetAnnual
      : financials.annualDifference > 0
        ? 1
        : -1;

  const isLowRisk = risk.overallScore <= 4;
  const isModerateRisk = risk.overallScore <= 6;

  if (financials.annualDifference > 0 && netAdvantagePercent >= 0.3 && isLowRisk) {
    fit = 'strong';
  } else if (financials.annualDifference > 0 && isModerateRisk) {
    fit = 'moderate';
  } else if (financials.annualDifference > 0 && netAdvantagePercent >= 0.5) {
    fit = 'moderate'; // high risk but big upside
  } else {
    fit = 'weak';
  }

  // Owner involvement
  let ownerInvolvement: RiskLevel;
  if (risk.overallScore <= 3) ownerInvolvement = 'low';
  else if (risk.overallScore <= 6) ownerInvolvement = 'moderate';
  else ownerInvolvement = 'high';

  // Risk level summary
  let riskLevel: RiskLevel;
  if (risk.overallScore <= 3) riskLevel = 'low';
  else if (risk.overallScore <= 6) riskLevel = 'moderate';
  else riskLevel = 'high';

  // Recommendation text
  const recommendation = buildRecommendation(fit, financials, risk, riskLevel);

  return {
    fit,
    netDifference: financials.annualDifference,
    riskLevel,
    ownerInvolvement,
    recommendation,
  };
}

function buildRecommendation(
  fit: VerdictFit,
  financials: FinancialSummary,
  risk: RiskProfile,
  riskLevel: RiskLevel,
): string {
  const absDiff = Math.abs(financials.annualDifference);
  const monthlyDiff = Math.abs(financials.monthlyDifference);
  const beOccupancy = Math.round(financials.breakEvenOccupancy * 100);

  if (fit === 'strong') {
    return (
      `This property is a strong candidate for short-term letting. ` +
      `It could generate approximately £${absDiff.toLocaleString()} more per year ` +
      `(£${monthlyDiff.toLocaleString()}/month) compared to a traditional long-let. ` +
      `The break-even occupancy is ${beOccupancy}%, which is comfortably achievable ` +
      `given the local demand drivers. Risk profile is ${riskLevel}, making this a ` +
      `favourable opportunity with manageable downside.`
    );
  }

  if (fit === 'moderate' && financials.annualDifference > 0) {
    return (
      `This property shows moderate potential for short-term letting, ` +
      `with an estimated annual uplift of £${absDiff.toLocaleString()} over a long-let. ` +
      `However, the break-even occupancy of ${beOccupancy}% and ${riskLevel} risk profile ` +
      `mean returns are sensitive to occupancy fluctuations. ` +
      `Consider using a professional management company and building a direct booking channel ` +
      `to mitigate platform dependency.`
    );
  }

  if (financials.annualDifference <= 0) {
    return (
      `Based on current market data, a long-term let appears more financially prudent ` +
      `for this property. The short-let strategy would yield approximately £${absDiff.toLocaleString()} ` +
      `less per year after costs. The break-even occupancy of ${beOccupancy}% exceeds ` +
      `achievable levels for the area. A traditional tenancy offers more predictable returns ` +
      `with significantly less operational overhead.`
    );
  }

  return (
    `This property presents a marginal case for short-term letting. ` +
    `While there is a potential uplift of £${absDiff.toLocaleString()}/year, ` +
    `the ${riskLevel} risk level and ${beOccupancy}% break-even occupancy suggest ` +
    `that the additional effort and cost may not justify the returns. ` +
    `Proceed only if you can achieve consistently high occupancy and are prepared ` +
    `for hands-on management or higher management fees.`
  );
}
