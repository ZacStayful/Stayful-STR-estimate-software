"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface SourceCard {
  name: string;
  detail: string;
  score: number;
}

const SOURCES: SourceCard[] = [
  { name: "Airbnb", detail: "Active local listings", score: 95 },
  { name: "PropertyData", detail: "Sold comparables", score: 88 },
  { name: "OpenRent", detail: "Long-let benchmark", score: 92 },
  { name: "Stayful data", detail: "Real managed costs", score: 100 },
];

export function AccuracyPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-primary-foreground/15 bg-primary p-5 text-primary-foreground">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">🔍</span>
          <span className="text-[14px] font-semibold">
            Is this information accurate?
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex shrink-0 items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/15 px-2.5 py-0.5 text-[11px] text-primary-foreground">
            High Confidence
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-primary-foreground/80 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <>
          {/* 4-column source grid */}
          <div className="mt-[14px] grid gap-[10px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCES.map((s) => (
              <div
                key={s.name}
                className="rounded-lg border border-primary-foreground/15 bg-primary-foreground/10"
                style={{ padding: "12px 14px" }}
              >
                <p className="text-[11px] font-semibold text-primary-foreground" style={{ marginBottom: 2 }}>
                  {s.name}
                </p>
                <p className="text-[11px] text-primary-foreground/70" style={{ marginBottom: 8 }}>
                  {s.detail}
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 overflow-hidden rounded-sm bg-primary-foreground/20"
                    style={{ height: 4 }}
                  >
                    <div
                      className="rounded-sm bg-primary-foreground"
                      style={{ height: 4, width: `${s.score}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-primary-foreground">
                    {s.score}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Methodology footnote */}
          <p className="mt-3 text-[12px] text-primary-foreground/70">
            Revenue projections are based on active comparable listings sourced from Airbnb,
            median-aggregated and updated in real time. Long-let comparison uses current
            OpenRent listings for the subject postcode. All cost assumptions use Stayful&apos;s
            managed portfolio averages.
          </p>
        </>
      )}
    </div>
  );
}
