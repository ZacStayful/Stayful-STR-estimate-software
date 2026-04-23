import { PublicNav } from "@/components/layout/PublicNav";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/intel-ui/Toast";
import { getOptionalUser } from "@/lib/intel/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <PublicNav authed={Boolean(user)} />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
