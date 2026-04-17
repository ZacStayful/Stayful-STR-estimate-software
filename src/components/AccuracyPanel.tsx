"use client";

// Confidence panel shown directly below the hero card on the Overview page.
// Each data source is hard-coded with a score reflecting Stayful's audited
// confidence in that feed. Not wired to live data — these are static figures
// calibrated against the current input pipeline.

interface SourceCard {
  name: string;
  detail: string;
  score: number; // 0–100
}

const SOURCES: SourceCard[] = [
  { name: "Airbnb", detail: "Active local listings", score: 95 },
  { name: "PropertyData", detail: "Sold comparables", score: 88 },
  { name: "OpenRent", detail: "Long-let benchmark", score: 92 },
  { name: "Stayful data", detail: "Real managed costs", score: 100 },
];

export function AccuracyPanel() {
  return (
    <div
      className="rounded-xl border"
      style={{
        background: "#f8f6f2",
        borderColor: "var(--border)",
        padding: "20px 24px",
      }}
    >
      {/* Header */}
      <div className="mb-[14px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">🔍</span>
          <span className="text-[14px] font-semibold text-foreground">
            Is this information accurate?
          </span>
        </div>
        <span
          className="inline-flex shrink-0 items-center border"
          style={{
            background: "#e4ede0",
            color: "#5d8156",
            borderColor: "var(--border)",
            borderRadius: 20,
            padding: "2px 10px",
            fontSize: 11,
          }}
        >
          High Confidence
        </span>
      </div>

      {/* 4-column source grid */}
      <div className="grid gap-[10px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {SOURCES.map((s) => (
          <div
            key={s.name}
            className="border bg-white"
            style={{
              borderColor: "var(--border)",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <p className="text-[11px] font-semibold text-foreground" style={{ marginBottom: 2 }}>
              {s.name}
            </p>
            <p className="text-[11px] text-muted-foreground" style={{ marginBottom: 8 }}>
              {s.detail}
            </p>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 overflow-hidden"
                style={{ height: 4, background: "#e4e0d8", borderRadius: 2 }}
              >
                <div
                  style={{
                    height: 4,
                    background: "var(--success)",
                    borderRadius: 2,
                    width: `${s.score}%`,
                  }}
                />
              </div>
              <span
                className="font-semibold"
                style={{ fontSize: 11, color: "var(--success)" }}
              >
                {s.score}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Methodology footnote */}
      <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 12 }}>
        Revenue projections are based on active comparable listings sourced from Airbnb,
        median-aggregated and updated in real time. Long-let comparison uses current
        OpenRent listings for the subject postcode. All cost assumptions use Stayful&apos;s
        managed portfolio averages.
      </p>
    </div>
  );
}
