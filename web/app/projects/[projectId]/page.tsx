import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { ProjectPage } from "./project-view";

export const metadata: Metadata = {
  title: "Project · SiteProof",
};

export default function Page({ params }: PageProps<"/projects/[projectId]">) {
  return (
    <Suspense fallback={<Loading what="Loading the project" />}>
      <Project params={params} />
    </Suspense>
  );
}

async function Project({ params }: { params: PageProps<"/projects/[projectId]">["params"] }) {
  const { projectId } = await params;
  return <ProjectPage projectId={projectId} />;
}
