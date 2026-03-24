// ─── Property Input ───────────────────────────────────────────────
export interface PropertyInput {
  address: string;
  postcode: string;
  bedrooms: number;
  guests: number;
}

// ─── Short-Term Let Data ──────────────────────────────────────────
export interface ShortLetComparable {
  title: string;
  url: string;
  bedrooms: number;
  accommodates: number;
  averageDailyRate: number;
  occupancyRate: number;
  annualRevenue: number;
  distance?: number;
}

export interface ShortLetData {
  annualRevenue: number;
  monthlyRevenue: [number, number, number, number, number, number, number, number, number, number, number, number];
  occupancyRate: number;
  averageDailyRate: number;
  activeListings: number;
  comparables: ShortLetComparable[];
}

// ─── Long-Term Let Data ──────────────────────────────────────────
export interface LongLetComparable {
  address: string;
  rent: number;
  distance: number;
  bedrooms: number;
}

export interface LongLetData {
  monthlyRent: number;
  estimateHigh: number;
  estimateLow: number;
  comparables: LongLetComparable[];
}

// ─── Nearby Amenities & Events ───────────────────────────────────
export interface NearbyAmenity {
  name: string;
  type: string;
  address: string;
  distance: number;
  rating: number | null;
}

export interface NearbyEvent {
  name: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  genre: string;
  distance: number | null;
  url: string;
}

// ─── Demand Drivers ──────────────────────────────────────────────
export interface DemandDrivers {
  hospitals: NearbyAmenity[];
  universities: NearbyAmenity[];
  airports: NearbyAmenity[];
  trainStations: NearbyAmenity[];
}

// ─── Risk Profile ────────────────────────────────────────────────
export type RiskLevel = 'low' | 'moderate' | 'high';

export interface RiskProfile {
  incomeVolatility: RiskLevel;
  setupCost: RiskLevel;
  regulatory: RiskLevel;
  guestDamage: RiskLevel;
  seasonality: RiskLevel;
  platformDependency: RiskLevel;
  locationDemand: RiskLevel;
  competition: RiskLevel;
  overallScore: number;
}

// ─── Financial Summary ───────────────────────────────────────────
export interface FinancialSummary {
  shortLetGrossAnnual: number;
  shortLetNetAnnual: number;
  longLetGrossAnnual: number;
  longLetNetAnnual: number;
  monthlyDifference: number;
  annualDifference: number;
  breakEvenOccupancy: number;
}

// ─── Property Verdict ────────────────────────────────────────────
export type VerdictFit = 'strong' | 'moderate' | 'weak';

export interface PropertyVerdict {
  fit: VerdictFit;
  netDifference: number;
  riskLevel: RiskLevel;
  ownerInvolvement: RiskLevel;
  recommendation: string;
}

// ─── Full Analysis Result ────────────────────────────────────────
export interface AnalysisResult {
  property: PropertyInput;
  coordinates: { lat: number; lng: number };
  shortLet: ShortLetData;
  longLet: LongLetData;
  demandDrivers: DemandDrivers;
  nearbyEvents: { events: NearbyEvent[]; totalEvents: number };
  financials: FinancialSummary;
  risk: RiskProfile;
  verdict: PropertyVerdict;
  createdAt: string;
  updatedAt: string;
}
