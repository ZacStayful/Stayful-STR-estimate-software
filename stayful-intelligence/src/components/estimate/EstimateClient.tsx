"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { SearchForm } from "./SearchForm";
import { SearchCounter } from "./SearchCounter";
import { ResultsPanel } from "./ResultsPanel";
import { ResultsSkeleton } from "./ResultsSkeleton";
import { useToast } from "@/components/intel-ui/Toast";
import type { EstimateResponse, Plan } from "@/lib/intel/types";

interface InitialState {
  plan: Plan;
  searchesRemaining: number | "unlimited";
  searchesUsed: number;
}

export function EstimateClient({
  initial,
  initialAddress,
  initialGuests,
}: {
  initial: InitialState;
  initialAddress?: string;
  initialGuests?: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = React.useState(false);
  const [response, setResponse] = React.useState<EstimateResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | "unlimited">(
    initial.searchesRemaining,
  );

  async function onSubmit(input: { address: string; guestCount: number }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (res.status === 402) {
        router.push("/upgrade");
        return;
      }

      const data = (await res.json()) as EstimateResponse | { error: string; message?: string };

      if (!res.ok || "error" in data) {
        const err = data as { error: string; message?: string };
        const msg = err.message ?? friendlyError(err.error);
        setError(msg);
        toast.show(msg, "error");
        return;
      }

      setResponse(data);
      setRemaining(data.searchesRemaining);
      // Refresh the layout so nav counter reflects the latest usage.
      router.refresh();
    } catch (err) {
      const msg = (err as Error).message || "Something went wrong. Please try again.";
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  const showCounter = initial.plan === "free";

  return (
    <div className="space-y-6">
      <SearchForm
        onSubmit={onSubmit}
        loading={loading}
        initialAddress={initialAddress}
        initialGuests={initialGuests}
      />

      {showCounter && response && (
        <SearchCounter searchesRemaining={remaining} hideWhenFull={false} />
      )}

      {loading && <ResultsSkeleton />}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-sm text-red-100">
          <p className="font-medium">Estimate failed</p>
          <p className="mt-1 text-red-200">{error}</p>
        </div>
      )}

      {!loading && response && <ResultsPanel response={response} />}

      {!loading && !response && !error && (
        <div className="rounded-2xl border border-dashed border-intel-border bg-bg-card/50 p-10 text-center">
          <h3 className="font-heading text-xl">Start with an address</h3>
          <p className="mt-2 text-sm text-text-muted">
            Enter a UK address with postcode and how many guests the property sleeps.
            You&apos;ll get an instant market-backed revenue estimate.
          </p>
        </div>
      )}
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "free_limit_reached":
      return "You've used your free searches. Upgrade to Pro for unlimited access.";
    case "no_postcode":
      return "We couldn't find a UK postcode in that address. Please include the full postcode.";
    case "geocode_failed":
      return "We couldn't locate that postcode. Please check it and try again.";
    case "no_data":
      return "Not enough Airbnb data for this area yet. Try a more central UK address.";
    case "unauthorized":
      return "Your session expired. Please log in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
