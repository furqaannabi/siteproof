import Link from "next/link";
import { AppHeader } from "@/components/ui";
import ui from "@/components/ui.module.css";
import { DEMO_PROJECT_ID } from "@/lib/data";
import { ProjectList } from "./home-view";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className={`${ui.main} ${ui.narrow}`}>
        <div>
          <h1 className={ui.h1}>Get paid on evidence, not arguments</h1>
          <p className={ui.lede}>
            Forward the progress clips you already send buyers. SiteProof places them by room, checks them against the demand letter, and shows buyers and banks
            exactly what&apos;s verified, with the frames to prove it.
          </p>
        </div>
        <div className={ui.row}>
          <Link href="/projects/new" className={ui.markButton}>
            Set up a project
          </Link>
          <Link href={`/projects/${DEMO_PROJECT_ID}/report`} className={ui.secondaryButton}>
            See the Flat 302 demo report
          </Link>
        </div>
        <ProjectList />
        <p className={ui.muted}>SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.</p>
      </main>
    </>
  );
}
