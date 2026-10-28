import type { Metadata, Viewport } from "next";
import { Anek_Latin, Mukta } from "next/font/google";
import "./globals.css";

// Both from Ek Type, an Indian foundry; both have Devanagari siblings for a Hindi version.
// Anek Latin's width axis gives the condensed figures and headings.
const anek = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--font-anek" });
const mukta = Mukta({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-mukta" });

export const metadata: Metadata = {
  title: "SiteProof",
  description: "Verified construction progress from the footage builders already take.",
};

// viewport-fit=cover lets the bottom bars sit clear of a phone's home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Dark-mode browser extensions write a style onto <html> before React loads, which
    // reads as a hydration mismatch. This ignores attribute differences on this one
    // element only; anything inside it is still checked.
    <html lang="en" className={`${anek.variable} ${mukta.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
