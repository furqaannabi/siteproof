import type { Metadata } from "next";
import { AppHeader } from "@/components/ui";
import s from "./setup.module.css";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "New project · SiteProof",
};

export default function NewProjectPage() {
  return (
    <>
      <AppHeader eyebrow="Set up" title="New project" nav={{ current: "new" }} />
      <main className={s.main}>
        <div>
          <h1 className={s.title}>Set up a project</h1>
          <p className={s.lede}>
            Most towers repeat the same flat. Type its rooms once, then add every flat that shares them. SiteProof makes one printed tag per room, so any clip
            that passes a doorway is placed automatically.
          </p>
        </div>
        <SetupForm />
      </main>
    </>
  );
}
