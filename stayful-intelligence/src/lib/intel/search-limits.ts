import type { Plan, Profile } from "./types";

export const FREE_SEARCH_LIMIT = 5;

export function canSearch(profile: Pick<Profile, "plan" | "searches_used">): boolean {
  if (profile.plan === "pro") return true;
  return profile.searches_used < FREE_SEARCH_LIMIT;
}

export function searchesRemaining(profile: Pick<Profile, "plan" | "searches_used">): number | "unlimited" {
  if (profile.plan === "pro") return "unlimited";
  return Math.max(0, FREE_SEARCH_LIMIT - profile.searches_used);
}

export function counterTone(remaining: number | "unlimited"): "ok" | "warn" | "danger" | "hidden" {
  if (remaining === "unlimited") return "hidden";
  if (remaining > 2) return "ok";
  if (remaining === 2) return "warn";
  if (remaining === 1) return "danger";
  return "hidden";
}

export function isPro(plan: Plan): boolean {
  return plan === "pro";
}
