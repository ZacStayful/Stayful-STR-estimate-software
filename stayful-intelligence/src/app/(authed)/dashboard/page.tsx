import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SavedSearchCard } from "@/components/dashboard/SavedSearchCard";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";
import type { SavedSearch } from "@/lib/intel/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .order("created_at", { ascending: false });

  const searches = (data ?? []) as SavedSearch[];

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-text-primary sm:text-4xl">Saved searches</h1>
          <p className="mt-1 text-sm text-text-muted">
            Everything you&apos;ve bookmarked, sorted newest first.
          </p>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-200">
          Couldn&apos;t load saved searches. {error.message}
        </p>
      ) : searches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {searches.map((s) => (
            <SavedSearchCard key={s.id} search={s} />
          ))}
        </div>
      )}
    </section>
  );
}
