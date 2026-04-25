import { ToastProvider } from "@/components/intel/Toast";
import { PublicNav } from "@/components/intel/PublicNav";
import { Footer } from "@/components/intel/Footer";
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
