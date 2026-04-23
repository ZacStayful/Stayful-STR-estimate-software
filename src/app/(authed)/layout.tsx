import { AppNavbar } from "@/components/layout/AppNavbar";
import { ToastProvider } from "@/components/intel-ui/Toast";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { searchesRemaining } from "@/lib/intel/search-limits";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { email, profile } = await requireUserAndProfile();
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <AppNavbar
          email={email}
          plan={profile.plan}
          searchesRemaining={searchesRemaining(profile)}
        />
        <main className="flex-1">{children}</main>
      </div>
    </ToastProvider>
  );
}
