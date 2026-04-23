import Link from "next/link";
import { Badge } from "@/components/intel-ui/Badge";
import { counterTone } from "@/lib/intel/search-limits";

export function SearchCounter({
  searchesRemaining,
  hideWhenFull = true,
}: {
  searchesRemaining: number | "unlimited";
  hideWhenFull?: boolean;
}) {
  const tone = counterTone(searchesRemaining);
  if (tone === "hidden") return null;
  if (typeof searchesRemaining !== "number") return null;
  if (hideWhenFull && searchesRemaining > 4) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-intel-border bg-bg-card2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Badge tone={tone === "ok" ? "sage" : tone === "warn" ? "amber" : "red"}>
          {searchesRemaining} of 5 left
        </Badge>
        <p className="text-sm text-text-muted">
          You have <span className="text-text-primary">{searchesRemaining}</span> searches
          remaining on your free plan. Upgrade to Pro for unlimited access.
        </p>
      </div>
      <Link
        href="/upgrade"
        className="text-sm font-medium text-sage-mid hover:text-text-primary"
      >
        Upgrade to Pro &rarr;
      </Link>
    </div>
  );
}
