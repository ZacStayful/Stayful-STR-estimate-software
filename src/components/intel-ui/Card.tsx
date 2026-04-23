import * as React from "react";
import { cn } from "@/lib/intel/cn";

export function Card({
  className,
  children,
  nested = false,
}: {
  className?: string;
  children: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-intel-border",
        nested ? "bg-bg-card2" : "bg-bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-6 pt-6", className)}>{children}</div>;
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
