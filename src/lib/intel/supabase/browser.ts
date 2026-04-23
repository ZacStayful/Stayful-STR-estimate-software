"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "../env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
