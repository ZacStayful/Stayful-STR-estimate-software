import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Server-side Supabase client for Server Components, Route Handlers and
 * Server Actions. Wires the request's cookie store into the client so auth
 * tokens can refresh on each request. Next.js 16's cookies() is async so the
 * factory itself must be awaited.
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
          /* Server Components can't mutate cookies — proxy.ts handles refresh. */
        }
      },
    },
  });
}
