"use client";

import * as React from "react";
import { Button } from "@/components/intel-ui/Button";
import { Card } from "@/components/intel-ui/Card";
import { CompSetTable } from "./CompSetTable";
import { MetricCard } from "./MetricCard";
import { MonthlyChart } from "./MonthlyChart";
import { SaveSearchModal } from "./SaveSearchModal";
import { useToast } from "@/components/intel-ui/Toast";
import { formatGBP, formatPercent } from "@/lib/intel/format";
import type { EstimateResponse } from "@/lib/intel/types";

export function ResultsPanel({ response }: { response: EstimateResponse }) {
  const toast = useToast();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);

  async function handleSave(name: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/searches/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: response.address,
          guestCount: response.guestCount,
          name,
          result: response,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setSaveOpen(false);
      setSavedFlash(true);
      toast.show("Saved to your dashboard.", "success");
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      toast.show((err as Error).message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Annual revenue"
          value={formatGBP(response.annualRevenue)}
          sub="Gross short-let"
          accent
        />
        <MetricCard
          label="Occupancy rate"
          value={formatPercent(response.occupancyRate)}
          sub="Market median"
        />
        <MetricCard
          label="Median ADR"
          value={formatGBP(response.medianADR)}
          sub="Average daily rate"
        />
        <MetricCard
          label="SA vs long-let"
          value={`${response.saVsLongLetUplift >= 0 ? "+" : ""}${formatGBP(
            response.saVsLongLetUplift,
          )}`}
          sub={`Long-let £${response.longLetAnnual.toLocaleString("en-GB")}/yr`}
        />
      </div>

      {response.dataQualityNote && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {response.dataQualityNote}
        </p>
      )}

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg">Monthly revenue forecast</h3>
            <p className="text-sm text-text-muted">
              Bars: gross revenue per month. Line: expected occupancy.
            </p>
          </div>
        </div>
        <MonthlyChart data={response.monthlyBreakdown} />
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg">Comparable listings</h3>
            <p className="text-sm text-text-muted">
              Top {response.compSet.length} active Airbnb listings nearby.
            </p>
          </div>
        </div>
        <CompSetTable comps={response.compSet} />
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setSaveOpen(true)}>
          {savedFlash ? "Saved" : "Save this search"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.show("PDF export is available from your Pro account.", "info")}
        >
          Download PDF
        </Button>
      </div>

      <SaveSearchModal
        open={saveOpen}
        defaultName={response.address}
        onClose={() => setSaveOpen(false)}
        onConfirm={handleSave}
        saving={saving}
      />
    </div>
  );
}
