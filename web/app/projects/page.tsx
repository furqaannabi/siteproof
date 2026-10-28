import type { Metadata } from "next";
import { AppHeader } from "@/components/ui";
import ui from "@/components/ui.module.css";
import { ProjectCards } from "./project-list";
import s from "./projects.module.css";

export const metadata: Metadata = {
  title: "Projects · SiteProof",
};

// The app's start page: every project as a card saying what's verified, what's open,
// and the one thing to do next. The landing page at / links here.
export default function ProjectsHome() {
  return (
    <>
      <AppHeader />
      <main className={`${ui.main} ${s.main}`}>
        <h1 className={ui.h1}>Your projects</h1>
        <ProjectCards />
        <p className={s.footer}>
          SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.
        </p>
      </main>
    </>
  );
}
