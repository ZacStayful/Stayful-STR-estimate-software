import Link from "next/link";
import { Button } from "@/components/intel-ui/Button";
import { Card } from "@/components/intel-ui/Card";

export function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-intel-border bg-bg-card2 text-sage-mid">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M4 10h16M4 14h16M7 4v16M17 4v16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <h3 className="font-heading text-xl">No saved searches yet</h3>
        <p className="mt-1 text-sm text-text-muted">
          Run your first estimate and save it here to compare properties side by side.
        </p>
      </div>
      <Link href="/estimate">
        <Button>Run an estimate</Button>
      </Link>
    </Card>
  );
}
