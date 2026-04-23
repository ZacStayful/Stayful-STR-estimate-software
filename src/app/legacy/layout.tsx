/**
 * The legacy property analyser uses the original light sage theme.
 * Scoping the CSS variables on this subtree keeps it visually intact
 * while the rest of the Intelligence app stays dark.
 */
export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="theme-legacy bg-background text-foreground min-h-screen">{children}</div>;
}
