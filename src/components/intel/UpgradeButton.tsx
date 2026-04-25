"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

export function UpgradeButton({ label = "Upgrade to Pro" }: { label?: string }) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);

  async function upgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Checkout failed (${res.status})`);
      window.location.href = data.url;
    } catch (err) {
      toast.show((err as Error).message ?? "Could not start checkout", "error");
      setLoading(false);
    }
  }

  return (
    <Button size="lg" className="w-full" onClick={upgrade} disabled={loading}>
      {loading ? "..." : label}
    </Button>
  );
}

export function OpenBillingPortalButton({ label = "Manage billing" }: { label?: string }) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Portal failed (${res.status})`);
      window.location.href = data.url;
    } catch (err) {
      toast.show((err as Error).message ?? "Could not open billing portal", "error");
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={open} disabled={loading}>
      {label}
    </Button>
  );
}
