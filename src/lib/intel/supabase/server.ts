import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Server-side Supabase client for use in Server Components, Route Handlers
 * and Server Actions. Wires the request's cookie store into the client so
 * that auth refresh tokens can round-trip with each render.
 *
 * In Next.js 16 `cookies()` is async; the call site must await this factory.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* Server Components cannot mutate cookies — proxy.ts handles refresh. */
        }
      },
    },
  });
}
