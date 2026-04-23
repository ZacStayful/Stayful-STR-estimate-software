/**
 * Domain types for the Stayful Intelligence app.
 * Kept separate from the legacy analyser types in /lib/types.ts.
 */

export type Plan = "free" | "pro";

export interface Profile {
  id: string;
  email: string | null;
  plan: Plan;
  searches_used: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  created_at: string;
}

export interface MonthlyBreakdown {
  month: string;
  revenue: number;
  occupancy: number;
  adr: number;
}

export interface CompListing {
  name: string;
  beds: number;
  guests: number;
  distance: number;
  occupancy: number;
  adr: number;
  annualRevenue: number;
  url?: string;
}

export interface EstimateResult {
  address: string;
  guestCount: number;
  annualRevenue: number;
  occupancyRate: number;
  medianADR: number;
  longLetAnnual: number;
  saVsLongLetUplift: number;
  monthlyBreakdown: MonthlyBreakdown[];
  compSet: CompListing[];
  dataQualityNote?: string;
}

export interface EstimateResponse extends EstimateResult {
  searchesUsed: number;
  searchesRemaining: number | "unlimited";
  plan: Plan;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  address: string;
  guest_count: number;
  result: EstimateResult;
  created_at: string;
}
