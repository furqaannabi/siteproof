import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { LinkedReportPage } from "../projects/[projectId]/report/report-view";

export const metadata: Metadata = {
  title: "Progress report · SiteProof",
  // A report link is private to its buyer and bank.
  robots: { index: false, follow: false },
};

// A flat's report, opened from its report link (`/report#<token>`). No login. The token
// is after `#`, so it never reaches this server; the report loads in the browser.
export default function Page() {
  return (
    <Suspense fallback={<Loading what="Loading the report" />}>
      <LinkedReportPage />
    </Suspense>
  );
}
