import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/intel/AuthForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </section>
  );
}
