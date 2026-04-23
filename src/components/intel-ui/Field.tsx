import * as React from "react";
import { cn } from "@/lib/intel/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-lg border border-intel-border bg-bg-card2 px-4 text-sm text-text-primary placeholder:text-text-muted/70 focus:border-sage-deep focus:outline-none focus:ring-2 focus:ring-sage-deep/30 disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-11 w-full rounded-lg border border-intel-border bg-bg-card2 px-4 text-sm text-text-primary focus:border-sage-deep focus:outline-none focus:ring-2 focus:ring-sage-deep/30 disabled:opacity-50",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-xs font-medium uppercase tracking-wider text-text-muted", className)}
    >
      {children}
    </label>
  );
}
