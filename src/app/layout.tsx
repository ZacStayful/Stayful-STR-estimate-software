import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stayful Property Analyser | Short-Term Rental Income Calculator",
  description:
    "Analyse your property's short-term rental potential with Stayful. Compare Airbnb income vs long-term let, view local demand drivers, and get a comprehensive risk assessment.",
  generator: "Stayful",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
