"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/intel-ui/Logo";
import { Badge } from "@/components/intel-ui/Badge";
import { counterTone } from "@/lib/intel/search-limits";
import { createSupabaseBrowserClient } from "@/lib/intel/supabase/browser";
import type { Plan } from "@/lib/intel/types";
import { cn } from "@/lib/intel/cn";

export function AppNavbar({
  email,
  plan,
  searchesRemaining,
}: {
  email: string | null;
  plan: Plan;
  searchesRemaining: number | "unlimited";
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const tone = counterTone(searchesRemaining);

  async function logOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-intel-border bg-bg-dark/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Logo href="/estimate" />
          <nav className="hidden items-center gap-5 text-sm text-text-muted md:flex">
            <Link className="hover:text-text-primary" href="/estimate">
              Estimate
            </Link>
            <Link className="hover:text-text-primary" href="/dashboard">
              Saved
            </Link>
            <Link className="hover:text-text-primary" href="/account">
              Account
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {tone !== "hidden" && typeof searchesRemaining === "number" && (
            <Badge
              tone={tone === "ok" ? "sage" : tone === "warn" ? "amber" : "red"}
              className="hidden sm:inline-flex"
            >
              {searchesRemaining} of 5 searches left
            </Badge>
          )}
          {plan === "pro" && <Badge tone="sage">PRO</Badge>}

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-intel-border bg-bg-card2 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary",
              )}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-deep/40 text-xs font-medium text-text-primary">
                {(email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[140px] truncate md:inline">{email}</span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-intel-border bg-bg-card shadow-xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <Link
                  href="/account"
                  className="block px-4 py-2 text-sm text-text-primary hover:bg-bg-card2"
                  onClick={() => setMenuOpen(false)}
                >
                  Account
                </Link>
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-sm text-text-primary hover:bg-bg-card2"
                  onClick={() => setMenuOpen(false)}
                >
                  Saved searches
                </Link>
                <button
                  onClick={logOut}
                  className="block w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-bg-card2"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
