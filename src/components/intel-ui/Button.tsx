import * as React from "react";
import { cn } from "@/lib/intel/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-sage-deep text-text-primary hover:bg-sage-deep/90 focus-visible:ring-sage-deep border border-sage-deep/60",
  secondary:
    "bg-bg-card2 text-text-primary border border-intel-border hover:border-intel-border-strong",
  ghost:
    "bg-transparent text-text-primary hover:bg-bg-card2 border border-transparent",
  outline:
    "bg-transparent text-text-primary border border-intel-border hover:bg-bg-card2 hover:border-intel-border-strong",
  danger:
    "bg-destructive/90 text-white hover:bg-destructive border border-destructive/60",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});
