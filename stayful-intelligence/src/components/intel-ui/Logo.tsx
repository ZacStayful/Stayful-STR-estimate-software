import Link from "next/link";
import { cn } from "@/lib/intel/cn";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 group", className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage-deep/15 border border-sage-deep/40 text-sage-mid"
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
      <span className="font-heading text-lg text-text-primary tracking-tight">
        Stayful <span className="text-sage-mid">Intelligence</span>
      </span>
    </Link>
  );
}
