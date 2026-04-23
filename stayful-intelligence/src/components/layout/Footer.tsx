import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-intel-border bg-bg-dark">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          &copy; {new Date().getFullYear()} Stayful Ltd &middot; intelligence.stayful.co.uk
        </div>
        <nav className="flex flex-wrap items-center gap-5">
          <Link className="hover:text-text-primary" href="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-text-primary" href="/login">
            Log in
          </Link>
          <Link className="hover:text-text-primary" href="/signup">
            Sign up
          </Link>
          <a className="hover:text-text-primary" href="mailto:hello@stayful.co.uk">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
