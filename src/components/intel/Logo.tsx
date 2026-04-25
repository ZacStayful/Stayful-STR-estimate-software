import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/30 text-primary"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M1 12L4 7.5L7 9L10 4.5L15 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="2" r="1.2" fill="currentColor" />
          <circle cx="10" cy="4.5" r="1.2" fill="currentColor" />
          <circle cx="7" cy="9" r="1.2" fill="currentColor" />
          <circle cx="4" cy="7.5" r="1.2" fill="currentColor" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Stayful <span className="text-primary">Intelligence</span>
      </span>
    </Link>
  );
}
