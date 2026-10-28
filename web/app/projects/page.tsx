import type { Metadata } from "next";
import { AppHeader } from "@/components/ui";
import { ProjectCards } from "./project-list";
import s from "./projects.module.css";

export const metadata: Metadata = {
  title: "Projects · SiteProof",
};

// The app's start page: what needs the builder across every flat, then each flat with
// what's verified. The landing page at / links here.
export default function ProjectsHome() {
  return (
    <>
      <AppHeader title="All projects" nav={{ current: "projects" }} />
      <main className={s.main}>
        <div>
          <h1 className={s.title}>Your projects</h1>
          <p className={s.lede}>What needs you first. Everything else is verified, being checked, or waiting on footage.</p>
        </div>
        <ProjectCards />
        <p className={s.footer}>
          SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.
        </p>
      </main>
    </>
  );
}
