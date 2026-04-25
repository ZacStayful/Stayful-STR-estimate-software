import { AppNavbar } from "@/components/intel/AppNavbar";
import { ToastProvider } from "@/components/intel/Toast";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { accessState } from "@/lib/intel/access";

/**
 * All authed routes pass through here. Layout-level work:
 *   1. requireUserAndProfile() redirects to /login if no session.
 *   2. AppNavbar shows the trial countdown / Pro badge.
 *
 * The expired-trial → /upgrade bounce is done per-page (via gateForFullAccess
 * in lib/intel/access.ts) because /account and /upgrade themselves must stay
 * reachable when the trial is expired so the user can actually subscribe.
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, profile } = await requireUserAndProfile();
  const access = accessState(profile);

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <AppNavbar email={email} access={access} />
        <main className="flex-1">{children}</main>
      </div>
    </ToastProvider>
  );
}
