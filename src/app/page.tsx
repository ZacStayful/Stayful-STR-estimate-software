"use client";

import { useState } from "react";
import Image from "next/image";
import { Search, MapPin, BedDouble, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Home() {
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [bedrooms, setBedrooms] = useState("2");
  const [guests, setGuests] = useState("4");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit to API and generate analysis
    console.log({ address, postcode, bedrooms, guests });
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary py-12 sm:py-16 lg:py-20">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <Image
              alt="Stayful"
              width={180}
              height={60}
              className="mb-6 h-12 w-auto sm:h-14"
              src="/images/stayful-logo.png"
              priority
            />
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
              Short-Term Rental Property Analyser
            </h1>
            <p className="mb-8 max-w-2xl text-lg text-primary-foreground/80">
              Get a comprehensive revenue analysis for your property. Compare
              short-term rental potential against traditional letting with real
              market data.
            </p>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className="relative z-10 -mt-8 pb-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
                Analyse Your Property
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Property Address
                  </Label>
                  <Input
                    id="address"
                    placeholder="e.g. 123 High Street"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postcode" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Postcode
                  </Label>
                  <Input
                    id="postcode"
                    placeholder="e.g. M4 7FE"
                    required
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="bedrooms"
                      className="flex items-center gap-2"
                    >
                      <BedDouble className="h-4 w-4" aria-hidden="true" />
                      Bedrooms
                    </Label>
                    <Input
                      type="number"
                      id="bedrooms"
                      min={1}
                      max={10}
                      required
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="guests"
                      className="flex items-center gap-2"
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Max Guests
                    </Label>
                    <Input
                      type="number"
                      id="guests"
                      min={1}
                      max={16}
                      required
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  Get Free Analysis
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <Image
            alt="Stayful"
            loading="lazy"
            width={100}
            height={35}
            className="mx-auto mb-4 h-8 w-auto opacity-60"
            src="/images/stayful-logo.png"
          />
          <p>&copy; {new Date().getFullYear()} Stayful. All rights reserved.</p>
          <p className="mt-2">
            Data sourced from Airbtics, AirDNA, OpenRent, and public market
            research.
          </p>
        </div>
      </footer>
    </main>
  );
}
