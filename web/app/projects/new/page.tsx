import type { Metadata } from "next";
import { AppHeader } from "@/components/ui";
import ui from "@/components/ui.module.css";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "New project · SiteProof",
};

export default function NewProjectPage() {
  return (
    <>
      <AppHeader eyebrow="Set up" title="New project" />
      <main className={`${ui.main} ${ui.narrow}`}>
        <div>
          <h1 className={ui.h1}>Set up a project</h1>
          <p className={ui.lede}>Name the flats and their rooms. SiteProof makes one printed tag per room, so any clip that passes a doorway is placed automatically.</p>
        </div>
        <SetupForm />
      </main>
    </>
  );
}
