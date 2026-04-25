"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { createSupabaseBrowserClient } from "@/lib/intel/supabase/browser";

export function DeleteAccountButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function confirm() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      await createSupabaseBrowserClient().auth.signOut();
      toast.show("Account deleted.", "success");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Delete your account?"
        description="This cancels any active subscription and permanently removes your saved searches. This can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={loading}>
            Yes, delete everything
          </Button>
        </div>
      </Modal>
    </>
  );
}
