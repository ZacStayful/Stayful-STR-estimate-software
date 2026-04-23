import { Card } from "@/components/intel-ui/Card";
import { cn } from "@/lib/intel/cn";

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-heading text-3xl",
          accent ? "text-sage-mid" : "text-text-primary",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-text-muted">{sub}</p>}
    </Card>
  );
}
