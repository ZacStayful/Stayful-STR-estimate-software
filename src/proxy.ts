import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/intel/env";

/**
 * Next.js 16 renamed `middleware.ts` → `proxy.ts`. Refreshes the Supabase
 * session on every matched request and gates protected routes.
 *
 *   /estimate, /dashboard, /account, /upgrade  → require auth
 *   /login, /signup                            → bounce signed-in users to /estimate
 *   everything else                            → public, but session still refreshes
 *
 * The trial-vs-Pro check happens further down (inside Server Components and
 * API routes) because it needs the profile row, not just the auth user.
 */

const PROTECTED = ["/estimate", "/dashboard", "/account", "/upgrade"];
const AUTH_ROUTES = ["/login", "/signup"];

function matchesPrefix(pathname: string, list: string[]): boolean {
  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // If Supabase env vars aren't set yet, fail open — marketing pages still render.
  if (!env.supabaseUrl || !env.supabaseAnonKey) return response;

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        for (const [key, val] of Object.entries(headers ?? {})) {
          response.headers.set(key, val);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (matchesPrefix(pathname, PROTECTED) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (matchesPrefix(pathname, AUTH_ROUTES) && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/estimate";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, the Next image loader, and Stripe webhooks (which
    // need the raw body and don't use sessions).
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)",
  ],
};
