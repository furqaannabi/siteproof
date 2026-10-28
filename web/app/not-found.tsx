import type { Metadata } from "next";
import { AppHeader, PageNotFound } from "@/components/ui";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = {
  title: "Page not found · SiteProof",
};

export default function NotFound() {
  return (
    <>
      <AppHeader brandHref="/" />
      <main className={ui.main}>
        <PageNotFound />
      </main>
    </>
  );
}
