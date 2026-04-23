import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://intelligence.stayful.co.uk"),
  title: {
    default: "Stayful Intelligence — UK STR revenue estimator",
    template: "%s · Stayful Intelligence",
  },
  description:
    "Know exactly what your UK property will earn on Airbnb before you buy. Live comparable data, monthly revenue forecasts, and SA vs long-let uplift in under 3 seconds.",
  generator: "Stayful Intelligence",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${playfair.variable} font-sans antialiased min-h-screen bg-bg-dark text-text-primary`}>
        {children}
      </body>
    </html>
  );
}
