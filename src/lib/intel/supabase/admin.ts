import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireServerEnv } from "../env";

/**
 * Service-role client for trusted server-side mutations that need to bypass RLS
 * (e.g. Stripe webhooks updating profile rows for any user). Never expose this
 * client to a browser context.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const serviceKey = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  cached = createClient(env.supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
