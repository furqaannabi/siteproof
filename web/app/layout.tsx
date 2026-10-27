import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SiteProof",
  description: "Verified construction progress from the footage builders already take.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
