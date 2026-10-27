import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "SiteProof",
  description: "Verified construction progress from the footage builders already take.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Dark-mode browser extensions write a style onto <html> before React loads, which
    // reads as a hydration mismatch. This ignores attribute differences on this one
    // element only; anything inside it is still checked.
    <html lang="en" className={`${barlow.variable} ${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
