import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ReportPage } from "./report-view";

export const metadata: Metadata = {
  title: "Progress report · SiteProof",
};

// One flat's report for its builder, behind the builder link; buyers and banks open it
// from their report link at /report. The report itself loads in the browser, so the
// static shell is just the loading state.
export default function Page({ params }: PageProps<"/projects/[projectId]/report">) {
  return (
    <Suspense fallback={<Loading what="Loading the report" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: PageProps<"/projects/[projectId]/report">["params"] }) {
  const { projectId } = await params;
  return <ReportPage projectId={projectId} />;
}
