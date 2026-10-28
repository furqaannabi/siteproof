import type { Metadata } from "next";
import { Landing } from "./landing";

export const metadata: Metadata = {
  title: "SiteProof · Verified construction progress",
  description:
    "SiteProof turns the progress clips builders already share into verified construction progress, so buyers and banks can release stage payments with evidence.",
};

export default function Page() {
  return <Landing />;
}
