"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";
import { createSupabaseBrowserClient } from "@/lib/intel/supabase/browser";

export function PasswordResetLink({ email }: { email: string | null }) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);

  async function send() {
    if (!email) {
      toast.show("No email on file.", "error");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/account`,
      });
      if (error) throw error;
      toast.show("Password reset email sent.", "success");
    } catch (err) {
      toast.show((err as Error).message ?? "Could not send reset email", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={send} disabled={loading}>
      Send password reset email
    </Button>
  );
}
