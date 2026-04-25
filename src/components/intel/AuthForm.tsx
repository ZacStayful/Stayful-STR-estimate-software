"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "./Toast";
import { createSupabaseBrowserClient } from "@/lib/intel/supabase/browser";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState(false);

  const redirectTo = params.get("redirect") || "/estimate";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
          },
        });
        if (error) throw error;
        toast.show("Check your email to confirm — your 14-day trial starts now.", "success");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.show((err as Error).message ?? "Authentication failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.show((err as Error).message ?? "Could not start Google sign-in", "error");
      setOauthLoading(false);
    }
  }

  const title = mode === "signup" ? "Start your 14-day free trial" : "Welcome back";
  const sub =
    mode === "signup"
      ? "Full access to the tool, PDF exports, and the setup calculator. No card needed."
      : "Log in to continue where you left off.";
  const cta = mode === "signup" ? "Create account" : "Log in";
  const alt =
    mode === "signup" ? (
      <>
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">Log in</Link>
      </>
    ) : (
      <>
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-primary hover:underline">Sign up</Link>
      </>
    );

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5"
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading ? "..." : cta}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={oauthLoading} size="lg">
        Continue with Google
      </Button>

      <p className="mt-8 text-center text-sm text-muted-foreground">{alt}</p>
    </div>
  );
}
