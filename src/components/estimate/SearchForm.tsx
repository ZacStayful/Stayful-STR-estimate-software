"use client";

import * as React from "react";
import { Button } from "@/components/intel-ui/Button";
import { Input, Label, Select } from "@/components/intel-ui/Field";

const GUEST_OPTIONS = [2, 4, 6, 8, 10];

export function SearchForm({
  onSubmit,
  loading,
  disabled,
  initialAddress = "",
  initialGuests = 4,
}: {
  onSubmit: (input: { address: string; guestCount: number }) => void;
  loading?: boolean;
  disabled?: boolean;
  initialAddress?: string;
  initialGuests?: number;
}) {
  const [address, setAddress] = React.useState(initialAddress);
  const [guests, setGuests] = React.useState(initialGuests);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    onSubmit({ address: address.trim(), guestCount: guests });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-2xl border border-intel-border bg-bg-card p-5 md:grid-cols-[2fr_auto_auto]"
    >
      <div>
        <Label htmlFor="address">Property address</Label>
        <Input
          id="address"
          name="address"
          placeholder="e.g. 14 Gillygate, York, YO31 7EQ"
          autoComplete="street-address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={disabled}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="guests">Guests</Label>
        <Select
          id="guests"
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          disabled={disabled}
          className="mt-1 min-w-[120px]"
        >
          {GUEST_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 10 ? "10+ guests" : `${n} guests`}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" loading={loading} disabled={disabled} size="lg" className="w-full md:w-auto">
          {loading ? "Estimating..." : "Get estimate"}
        </Button>
      </div>
    </form>
  );
}
