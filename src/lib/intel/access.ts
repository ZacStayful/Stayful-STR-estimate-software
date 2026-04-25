/**
 * Trial-based access control.
 *
 * Free users get full access for 14 days from signup, then must subscribe.
 * Pro users always have access while their Stripe subscription is active.
 */

import { redirect } from "next/navigation";
import type { Profile } from "./types";

export const TRIAL_DAYS = 14;

export function isProActive(profile: Pick<Profile, "plan" | "stripe_subscription_status">): boolean {
  if (profile.plan !== "pro") return false;
  // Treat trialing/active/past_due as access-granting; cancellation is handled
  // by the webhook flipping plan back to 'free'.
  const ok = ["active", "trialing", "past_due"];
  return profile.stripe_subscription_status === null || ok.includes(profile.stripe_subscription_status);
}

export function trialMsRemaining(profile: Pick<Profile, "trial_ends_at">): number {
  return Math.max(0, new Date(profile.trial_ends_at).getTime() - Date.now());
}

export function trialDaysRemaining(profile: Pick<Profile, "trial_ends_at">): number {
  return Math.ceil(trialMsRemaining(profile) / (24 * 60 * 60 * 1000));
}

export function isTrialActive(profile: Pick<Profile, "trial_ends_at">): boolean {
  return trialMsRemaining(profile) > 0;
}

export function canAccess(
  profile: Pick<Profile, "plan" | "stripe_subscription_status" | "trial_ends_at">,
): boolean {
  return isProActive(profile) || isTrialActive(profile);
}

export type AccessState =
  | { kind: "pro" }
  | { kind: "trialing"; daysRemaining: number }
  | { kind: "expired" };

export function accessState(
  profile: Pick<Profile, "plan" | "stripe_subscription_status" | "trial_ends_at">,
): AccessState {
  if (isProActive(profile)) return { kind: "pro" };
  if (isTrialActive(profile)) {
    return { kind: "trialing", daysRemaining: trialDaysRemaining(profile) };
  }
  return { kind: "expired" };
}

/**
 * Server-side gate for pages that should be unavailable to expired-trial
 * non-subscribers. Bounces to /upgrade with a hint so the page can show the
 * "your trial has ended" copy.
 */
export function gateForFullAccess(access: AccessState): void {
  if (access.kind === "expired") redirect("/upgrade?reason=trial_expired");
}
