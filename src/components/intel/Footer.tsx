import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>&copy; {new Date().getFullYear()} Stayful Ltd</div>
        <nav className="flex flex-wrap items-center gap-5">
          <Link className="hover:text-foreground" href="/pricing">Pricing</Link>
          <Link className="hover:text-foreground" href="/login">Log in</Link>
          <Link className="hover:text-foreground" href="/signup">Sign up</Link>
          <a className="hover:text-foreground" href="mailto:hello@stayful.co.uk">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
