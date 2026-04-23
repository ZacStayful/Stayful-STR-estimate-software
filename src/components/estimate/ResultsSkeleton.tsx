import { Card } from "@/components/intel-ui/Card";

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-bg-card2 ${className ?? ""}`} />;
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Pulse className="h-3 w-20" />
            <Pulse className="mt-3 h-8 w-28" />
            <Pulse className="mt-2 h-3 w-16" />
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <Pulse className="h-4 w-48" />
        <Pulse className="mt-6 h-64 w-full" />
      </Card>
      <Card className="p-6">
        <Pulse className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Pulse key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
