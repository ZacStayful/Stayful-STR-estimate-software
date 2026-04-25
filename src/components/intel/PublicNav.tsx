import Link from "next/link";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";

export function PublicNav({ authed = false }: { authed?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link className="hover:text-foreground" href="/#features">
            Features
          </Link>
          <Link className="hover:text-foreground" href="/#how-it-works">
            How it works
          </Link>
          <Link className="hover:text-foreground" href="/pricing">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {authed ? (
            <Link href="/estimate">
              <Button size="sm">Open app</Button>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline-block"
              >
                Log in
              </Link>
              <Link href="/signup">
                <Button size="sm">Start 14-day trial</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
