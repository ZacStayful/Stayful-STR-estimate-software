import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { accessState, gateForFullAccess } from "@/lib/intel/access";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import { formatDate } from "@/lib/intel/format";
import type { SavedSearch } from "@/lib/intel/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile } = await requireUserAndProfile("/dashboard");
  gateForFullAccess(accessState(profile));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .order("created_at", { ascending: false });

  const searches = (data ?? []) as SavedSearch[];

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Saved searches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you&apos;ve bookmarked from the analyser, sorted newest first.
          </p>
        </div>
        <Link href="/estimate"><Button>Run a new estimate</Button></Link>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Couldn&apos;t load saved searches. {error.message}
        </p>
      ) : searches.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {searches.map((s) => <SavedSearchCard key={s.id} search={s} />)}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <h3 className="text-xl font-semibold">No saved searches yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Run an estimate from the analyser, then click &ldquo;Save this search&rdquo; — it&apos;ll show up here.
      </p>
      <div className="mt-6">
        <Link href="/estimate"><Button>Run an estimate</Button></Link>
      </div>
    </div>
  );
}

function SavedSearchCard({ search }: { search: SavedSearch }) {
  const result = (search.result ?? {}) as Record<string, unknown>;
  const annual = typeof result.annualRevenue === "number" ? result.annualRevenue : null;
  return (
    <li className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
      <p className="text-base font-semibold">{search.name ?? search.address}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{search.address}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sleeps {search.guest_count} &middot; Saved {formatDate(search.created_at)}
      </p>
      {annual !== null && (
        <p className="mt-4 text-2xl font-semibold text-primary">
          £{annual.toLocaleString("en-GB")}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-5">
        <Link href="/estimate" className="flex-1">
          <Button size="sm" variant="outline" className="w-full">Open analyser</Button>
        </Link>
      </div>
    </li>
  );
}
