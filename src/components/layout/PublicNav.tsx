import Link from "next/link";
import { Logo } from "@/components/intel-ui/Logo";
import { Button } from "@/components/intel-ui/Button";

export function PublicNav({ authed = false }: { authed?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-intel-border bg-bg-dark/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-text-muted md:flex">
          <Link className="hover:text-text-primary" href="/#how-it-works">
            How it works
          </Link>
          <Link className="hover:text-text-primary" href="/#compare">
            Compare
          </Link>
          <Link className="hover:text-text-primary" href="/pricing">
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
                className="hidden text-sm text-text-muted hover:text-text-primary sm:inline-block"
              >
                Log in
              </Link>
              <Link href="/signup">
                <Button size="sm">Start free trial</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
