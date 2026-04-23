import { formatGBP, formatPercent } from "@/lib/intel/format";
import type { CompListing } from "@/lib/intel/types";

export function CompSetTable({ comps }: { comps: CompListing[] }) {
  if (comps.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No comparable listings found within range.
      </p>
    );
  }

  const avgDistance = comps.reduce((sum, c) => sum + c.distance, 0) / comps.length;
  const avgOccupancy = comps.reduce((sum, c) => sum + c.occupancy, 0) / comps.length;
  const avgAdr = comps.reduce((sum, c) => sum + c.adr, 0) / comps.length;
  const avgAnnual = comps.reduce((sum, c) => sum + c.annualRevenue, 0) / comps.length;

  return (
    <div className="overflow-hidden rounded-xl border border-intel-border">
      <table className="w-full text-sm">
        <thead className="bg-bg-card2 text-left text-xs uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Listing</th>
            <th className="px-4 py-3 font-medium">Distance</th>
            <th className="px-4 py-3 font-medium">Guests</th>
            <th className="px-4 py-3 font-medium">Occupancy</th>
            <th className="px-4 py-3 font-medium">ADR</th>
            <th className="px-4 py-3 text-right font-medium">Annual rev</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-intel-border">
          {comps.map((c, i) => (
            <tr key={`${c.name}-${i}`} className="text-text-primary hover:bg-bg-card2/50">
              <td className="max-w-[260px] truncate px-4 py-3">
                {c.url ? (
                  <a
                    href={c.url}
                    className="hover:text-sage-mid"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
              </td>
              <td className="px-4 py-3 text-text-muted">{c.distance.toFixed(1)} km</td>
              <td className="px-4 py-3 text-text-muted">{c.guests}</td>
              <td className="px-4 py-3">{formatPercent(c.occupancy)}</td>
              <td className="px-4 py-3">{formatGBP(c.adr)}</td>
              <td className="px-4 py-3 text-right font-medium">
                {formatGBP(c.annualRevenue)}
              </td>
            </tr>
          ))}
          <tr className="bg-bg-card2 text-text-primary">
            <td className="px-4 py-3 text-xs uppercase tracking-wider text-text-muted">
              Average
            </td>
            <td className="px-4 py-3 text-text-muted">{avgDistance.toFixed(1)} km</td>
            <td className="px-4 py-3 text-text-muted">&mdash;</td>
            <td className="px-4 py-3">{formatPercent(avgOccupancy)}</td>
            <td className="px-4 py-3">{formatGBP(avgAdr)}</td>
            <td className="px-4 py-3 text-right font-medium text-sage-mid">
              {formatGBP(avgAnnual)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
