/**
 * Domain types for the SaaS shell wrapping the STR analyser.
 * Kept in their own namespace under lib/intel/ so they don't collide with
 * the existing analyser's lib/types.ts.
 */

export type Plan = "free" | "pro";

export interface Profile {
  id: string;
  email: string | null;
  plan: Plan;
  trial_started_at: string;
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  created_at: string;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string | null;
  address: string;
  postcode: string | null;
  guest_count: number;
  bedrooms: number | null;
  result: unknown;
  created_at: string;
}
