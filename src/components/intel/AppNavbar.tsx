"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/intel/supabase/browser";
import type { AccessState } from "@/lib/intel/access";
import { cn } from "@/lib/utils";

/**
 * Authenticated nav. Shows trial countdown for trialing users, a "Pro" badge
 * for subscribers, and a basic email/avatar menu with Account/Log out.
 */
export function AppNavbar({
  email,
  access,
}: {
  email: string | null;
  access: AccessState;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);

  async function logOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Logo href="/estimate" />
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <Link className="hover:text-foreground" href="/estimate">Tool</Link>
            <Link className="hover:text-foreground" href="/dashboard">Saved</Link>
            <Link className="hover:text-foreground" href="/account">Account</Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {access.kind === "trialing" && (
            <span
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                access.daysRemaining > 7 && "border-primary/30 bg-primary/10 text-primary",
                access.daysRemaining <= 7 && access.daysRemaining > 2 && "border-warning/40 bg-warning/10 text-warning-foreground",
                access.daysRemaining <= 2 && "border-destructive/50 bg-destructive/10 text-destructive",
              )}
            >
              {access.daysRemaining} {access.daysRemaining === 1 ? "day" : "days"} left in trial
            </span>
          )}
          {access.kind === "pro" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              PRO
            </span>
          )}

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/30 text-xs font-medium text-primary-foreground">
                {(email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[140px] truncate md:inline">{email}</span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <Link
                  href="/account"
                  className="block px-4 py-2 text-sm hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  Account
                </Link>
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-sm hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  Saved searches
                </Link>
                <button
                  onClick={logOut}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-muted"
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
