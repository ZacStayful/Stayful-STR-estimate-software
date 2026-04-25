import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/intel/AuthForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </section>
  );
}
