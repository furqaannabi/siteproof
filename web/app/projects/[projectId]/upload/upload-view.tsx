"use client";

import type { DocumentKind, ProjectOverview } from "@siteproof/contract";
import Link from "next/link";
import { useState } from "react";
import { AppHeader, ErrorPanel, Loading, ProjectNav, StaleNotice, ui, useOverview } from "@/components/ui";
import { CLIP_ACCEPT, DOCUMENT_ACCEPT, DropZone, UploadList, useUploads } from "@/components/uploads";
import { DOCUMENT_LABEL } from "../project-view";
import styles from "./upload.module.css";

export function UploadPage({ projectId }: { projectId: string }) {
  const { overview: report, error, stale, reload } = useOverview(projectId);
  if (error) {
    return (
      <>
        <AppHeader />
        <main className={ui.main}>
          <ErrorPanel error={error} retry={reload} />
        </main>
      </>
    );
  }
  if (!report) {
    return (
      <>
        <AppHeader />
        <Loading what="Loading the project" />
      </>
    );
  }
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <UploadView report={report} onSettled={reload} />
    </>
  );
}

function UploadView({ report, onSettled }: { report: ProjectOverview; onSettled: () => void }) {
  const { project } = report;
  const clips = useUploads(report.project.id, onSettled);
  const docs = useUploads(report.project.id, onSettled);
  const [kind, setKind] = useState<DocumentKind>("demand_letter");
  const [flatId, setFlatId] = useState<string>(project.flats[0]?.id ?? "");

  // A BOQ covers the whole project; a demand letter or invoice bills one flat.
  const wholeProject = kind === "boq";
  const flatLabel = (id: string) => `Flat ${project.flats.find((f) => f.id === id)?.name ?? ""}`;

  return (
    <>
      <AppHeader eyebrow={project.builder} title={project.name}>
        <ProjectNav projectId={project.id} current="upload" />
      </AppHeader>
      <main className={`${ui.main} ${ui.narrow}`}>
        <div>
          <h1 className={ui.h1}>Upload</h1>
          <p className={ui.lede}>Send the clips you already have, in any order. Nothing needs to be filmed specially. Each clip is placed by the room tags it passes.</p>
        </div>

        <section className={ui.panel}>
          <div className={ui.panelHead}>
            <h2 className={ui.h2}>Clips</h2>
            <span className={ui.muted}>MP4 or MOV · WhatsApp clips are fine</span>
          </div>
          <DropZone
            title="Add clips"
            hint="Tap to choose videos or film one now. On a computer, drop files here."
            accept={CLIP_ACCEPT}
            multiple
            onFiles={(files) => files.forEach((f) => clips.addClip(project.id, f))}
          />
          <details className={styles.tips}>
            <summary>How to film a room so it can be fully checked</summary>
            <ol>
              <li>Start in the doorway, with the room tag in frame.</li>
              <li>Pan slowly in one direction around the room.</li>
              <li>Don&apos;t pan back over what you&apos;ve already filmed.</li>
            </ol>
            <p className={ui.muted}>A clip that doesn&apos;t do this still counts, but the room may show as Not seen yet until one does.</p>
          </details>
          <UploadList items={clips.items} onRetry={clips.retry} />
        </section>

        <section className={ui.panel}>
          <div className={ui.panelHead}>
            <h2 className={ui.h2}>Documents</h2>
            <span className={ui.muted}>PDF</span>
          </div>
          <div className={ui.row}>
            <label className={ui.field}>
              <span>Document</span>
              <select className={ui.select} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {(Object.keys(DOCUMENT_LABEL) as DocumentKind[]).map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={ui.field}>
              <span>Which flat</span>
              {wholeProject ? (
                <select className={ui.select} disabled value="">
                  <option value="">Whole project</option>
                </select>
              ) : (
                <select className={ui.select} value={flatId} onChange={(e) => setFlatId(e.target.value)}>
                  {project.flats.map((f) => (
                    <option key={f.id} value={f.id}>
                      Flat {f.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          <DropZone
            title={`Add ${DOCUMENT_LABEL[kind].toLowerCase()}`}
            hint="The PDF the document was made from reads best."
            accept={DOCUMENT_ACCEPT}
            onFiles={(files) =>
              files.forEach((f) =>
                docs.addDocument(
                  { project_id: project.id, flat_id: wholeProject ? null : flatId, kind },
                  f,
                  `${DOCUMENT_LABEL[kind]} · ${wholeProject ? "Whole project" : flatLabel(flatId)}`,
                ),
              )
            }
          />
          <UploadList items={docs.items} onRetry={docs.retry} />
        </section>

        <div className={ui.row}>
          <Link href={`/projects/${project.id}/report`} className={ui.primaryButton}>
            Open the report
          </Link>
          <Link href={`/projects/${project.id}`} className={ui.secondaryButton}>
            Back to project
          </Link>
        </div>
      </main>
    </>
  );
}
