import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { UploadPage } from "./upload-view";

export const metadata: Metadata = {
  title: "Upload · SiteProof",
};

export default function Page({ params }: PageProps<"/projects/[projectId]/upload">) {
  return (
    <Suspense fallback={<Loading what="Loading the project" />}>
      <Upload params={params} />
    </Suspense>
  );
}

async function Upload({ params }: { params: PageProps<"/projects/[projectId]/upload">["params"] }) {
  const { projectId } = await params;
  return <UploadPage projectId={projectId} />;
}
