"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

export function DeleteSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);

  async function del() {
    if (!confirm("Delete this saved search?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/searches/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.show("Search deleted.", "success");
      router.refresh();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="destructive" onClick={del} disabled={loading}>
      Delete
    </Button>
  );
}
