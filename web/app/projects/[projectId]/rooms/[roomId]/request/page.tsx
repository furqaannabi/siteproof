import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { RequestPage } from "./request-view";

export const metadata: Metadata = {
  title: "Footage request · SiteProof",
};

type Props = PageProps<"/projects/[projectId]/rooms/[roomId]/request">;

// Opened from a WhatsApp link on the site supervisor's phone.
export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<Loading what="Loading the request" />}>
      <Request params={params} />
    </Suspense>
  );
}

async function Request({ params }: { params: Props["params"] }) {
  const { projectId, roomId } = await params;
  return <RequestPage projectId={projectId} roomId={roomId} />;
}
