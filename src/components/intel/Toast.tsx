"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

interface ToastItem { id: number; message: string; tone: Tone }
interface ToastCtx { show(message: string, tone?: Tone): void }

const Ctx = React.createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const show = React.useCallback((message: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-xl",
              item.tone === "success" && "border-primary/50 bg-primary/15 text-foreground",
              item.tone === "error" && "border-destructive/60 bg-destructive/15 text-destructive",
              item.tone === "info" && "border-border bg-card text-foreground",
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
