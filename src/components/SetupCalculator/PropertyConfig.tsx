"use client";

import type { FurnishingState } from "./lineItemDefaults";
import { FURNISHING_LABELS } from "./lineItemDefaults";

interface Props {
  furnishing: FurnishingState;
  bedrooms: number;
  onFurnishingChange: (v: FurnishingState) => void;
  onBedroomsChange: (n: number) => void;
}

const OPTIONS: { value: FurnishingState; hint: string }[] = [
  { value: "fully",       hint: "Property already has beds, sofas, tables etc." },
  { value: "part",        hint: "Some items present, some missing" },
  { value: "unfurnished", hint: "Completely bare" },
];

export function PropertyConfig({ furnishing, bedrooms, onFurnishingChange, onBedroomsChange }: Props) {
  return (
    <div className="space-y-4">
      {/* Furnishing state */}
      <div>
        <p className="mb-2 text-xs font-semibold text-primary-foreground/80">Furnishing state</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {OPTIONS.map((opt) => {
            const active = furnishing === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFurnishingChange(opt.value)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-primary-foreground bg-primary-foreground/20 text-primary-foreground"
                    : "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground/80 hover:bg-primary-foreground/10"
                }`}
              >
                <p className="text-sm font-semibold">{FURNISHING_LABELS[opt.value]}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-primary-foreground/70">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bedrooms */}
      <div>
        <label htmlFor="setup-bedrooms" className="mb-2 block text-xs font-semibold text-primary-foreground/80">
          Number of bedrooms
        </label>
        <input
          id="setup-bedrooms"
          type="number"
          min={1}
          max={10}
          step={1}
          value={bedrooms}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onBedroomsChange(Math.max(1, Math.min(10, Math.round(n))));
          }}
          className="w-24 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2 text-sm font-semibold text-primary-foreground outline-none focus:border-primary-foreground/60"
        />
      </div>
    </div>
  );
}
