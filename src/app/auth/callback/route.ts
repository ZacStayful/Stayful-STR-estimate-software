import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth + magic-link callback. Supabase appends `?code=...` to this URL —
 * we exchange it for a session cookie and forward to the requested page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("redirect") || "/estimate";

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
