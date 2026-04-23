"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/intel-ui/Button";
import { Card } from "@/components/intel-ui/Card";
import { useToast } from "@/components/intel-ui/Toast";
import { formatDate, formatGBP, formatPercent } from "@/lib/intel/format";
import type { SavedSearch } from "@/lib/intel/types";

export function SavedSearchCard({ search }: { search: SavedSearch }) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState(false);

  async function del() {
    if (!confirm("Delete this saved search?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/searches/${search.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.show("Search deleted.", "success");
      router.refresh();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setDeleting(false);
    }
  }

  const runAgainHref = `/estimate?address=${encodeURIComponent(
    search.address,
  )}&guests=${search.guest_count}`;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex-1">
        <p className="font-heading text-lg text-text-primary">{search.name}</p>
        <p className="mt-1 text-sm text-text-muted">{search.address}</p>
        <p className="mt-1 text-xs text-text-muted/80">
          Sleeps {search.guest_count} &middot; Saved {formatDate(search.created_at)}
        </p>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-wider text-text-muted">Annual revenue</p>
          <p className="font-heading text-3xl text-sage-mid">
            {formatGBP(search.result.annualRevenue)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {formatPercent(search.result.occupancyRate)} occupancy &middot;{" "}
            {formatGBP(search.result.medianADR)} ADR
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Link href={runAgainHref} className="flex-1">
          <Button size="sm" className="w-full">
            Run again
          </Button>
        </Link>
        <Button variant="danger" size="sm" onClick={del} loading={deleting}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
