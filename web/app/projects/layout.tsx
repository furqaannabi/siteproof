import { Suspense } from "react";
import { BuilderNav, BuilderNavFrame } from "@/components/ui";

// The builder's pages share one sidebar, drawn here so it stays put between them. It reads
// the address, which is only known at request time, so it sits in its own Suspense
// boundary and the rest of the page isn't held up for it.
export default function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  return (
    <>
      <Suspense fallback={<BuilderNavFrame />}>
        <BuilderNav />
      </Suspense>
      {children}
    </>
  );
}
