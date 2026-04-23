import Stripe from "stripe";
import { requireServerEnv } from "./env";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = requireServerEnv("STRIPE_SECRET_KEY");
  cached = new Stripe(key, {
    typescript: true,
    appInfo: { name: "stayful-intelligence" },
  });
  return cached;
}

export function getProPriceId(): string {
  return requireServerEnv("STRIPE_PRO_PRICE_ID");
}
