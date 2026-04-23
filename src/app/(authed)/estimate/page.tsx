import type { Metadata } from "next";
import { EstimateClient } from "@/components/estimate/EstimateClient";
import { SearchCounter } from "@/components/estimate/SearchCounter";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { searchesRemaining } from "@/lib/intel/search-limits";

export const metadata: Metadata = { title: "Estimate" };

export default async function EstimatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireUserAndProfile("/estimate");
  const remaining = searchesRemaining(profile);
  const params = await searchParams;
  const initialAddress = typeof params.address === "string" ? params.address : "";
  const guestsRaw = typeof params.guests === "string" ? Number(params.guests) : NaN;
  const initialGuests = Number.isFinite(guestsRaw) && guestsRaw >= 1 && guestsRaw <= 16 ? guestsRaw : undefined;

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl text-text-primary sm:text-4xl">
          Estimate a property
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Enter a UK address with postcode and how many guests the property sleeps.
        </p>
      </header>

      {profile.plan === "free" && (
        <div className="mb-6">
          <SearchCounter searchesRemaining={remaining} hideWhenFull={false} />
        </div>
      )}

      <EstimateClient
        initial={{
          plan: profile.plan,
          searchesUsed: profile.searches_used,
          searchesRemaining: remaining,
        }}
        initialAddress={initialAddress}
        initialGuests={initialGuests}
      />
    </section>
  );
}
