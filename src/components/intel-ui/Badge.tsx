import * as React from "react";
import { cn } from "@/lib/intel/cn";

type Tone = "default" | "sage" | "amber" | "red" | "outline";

const tones: Record<Tone, string> = {
  default: "bg-bg-card2 text-text-primary border-intel-border",
  sage: "bg-sage-deep/15 text-sage-mid border-sage-deep/40",
  amber: "bg-warning/15 text-warning border-warning/40",
  red: "bg-destructive/15 text-red-300 border-destructive/40",
  outline: "bg-transparent text-text-muted border-intel-border",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
