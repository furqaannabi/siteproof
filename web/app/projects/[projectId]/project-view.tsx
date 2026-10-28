"use client";

import type { DocumentKind, ProjectOverview } from "@siteproof/contract";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppHeader, captureTime, ErrorPanel, Loading, ProjectNav, StaleNotice, StatusBadge, ui, useOverview } from "@/components/ui";
import styles from "./project.module.css";

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  demand_letter: "Demand letter",
  invoice: "Invoice",
  boq: "Bill of quantities",
};

export function ProjectPage({ projectId }: { projectId: string }) {
  const { overview: report, error, stale, reload } = useOverview(projectId);
  const created = useSearchParams().get("created") === "1";

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
      <ProjectView report={report} created={created} />
    </>
  );
}

function ProjectView({ report, created }: { report: ProjectOverview; created: boolean }) {
  const { project } = report;
  const flatName = new Map(project.flats.map((f) => [f.id, f.name]));
  const hasLetter = report.documents.some((d) => d.kind === "demand_letter" && d.status !== "failed");
  const hasBoq = report.documents.some((d) => d.kind === "boq" && d.status !== "failed");
  const hasClips = report.clips.some((c) => c.status !== "failed");
  // The report has something to show once a demand letter is read and a clip has gone through.
  const hasResults = report.documents.some((d) => d.kind === "demand_letter" && d.status === "done") && report.clips.some((c) => c.status === "done");

  const steps = [
    // Printing happens off-screen, so this step is a reminder, never ticked.
    { done: false, label: "Print the room tags and stick one at each doorway", href: "#tags" },
    { done: hasLetter && hasBoq, label: "Upload the demand letter and the bill of quantities", href: `/projects/${project.id}/upload` },
    { done: hasClips, label: "Upload the progress clips you already have", href: `/projects/${project.id}/upload` },
    { done: hasResults, label: "Open the report and send it to buyers", href: `/projects/${project.id}/report` },
  ];

  return (
    <>
      <AppHeader eyebrow={project.builder} title={project.name}>
        <ProjectNav projectId={project.id} current="project" />
      </AppHeader>
      <main className={ui.main}>
        {created && (
          <div className={styles.created} role="status">
            <strong>Project created.</strong> Print the room tags below before anyone films.
          </div>
        )}

        <section className={styles.top}>
          <div>
            <span className={ui.eyebrow}>{project.flats.length === 1 ? `Flat ${project.flats[0].name}` : `${project.flats.length} flats`} · {report.rooms.length} rooms</span>
            <h1 className={ui.h1}>{project.name}</h1>
          </div>
          <ol className={styles.steps}>
            {steps.map((s, i) => (
              <li key={s.label} data-done={s.done}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {s.done ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <Link href={s.href}>{s.label}</Link>
                <span className={styles.srOnly}>{s.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="tags" className={styles.tagsSection}>
          <div className={ui.panelHead}>
            <h2 className={ui.h2}>Room tags</h2>
            <button type="button" className={ui.secondaryButton} onClick={() => window.print()}>
              Print tags
            </button>
          </div>
          <p className={ui.muted}>Stick each tag at its room&apos;s doorway, at chest height, where a clip starting in the doorway will see it.</p>
          {project.flats.map((f) => (
            <div key={f.id} className={styles.flatTags}>
              {project.flats.length > 1 && <h3 className={styles.flatHeading}>Flat {f.name}</h3>}
              <ul className={styles.tags}>
                {report.rooms
                  .filter((r) => r.flat === f.id)
                  .map((r) => (
                    <li key={r.id} className={styles.tag}>
                      <TagCode code={r.qr_code} />
                      <span className={styles.tagLabel}>
                        Flat {f.name} · {r.name}
                      </span>
                      <span className={styles.tagCode}>{r.qr_code}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <div className={styles.columns}>
          <section className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 className={ui.h2}>Documents</h2>
              <Link href={`/projects/${project.id}/upload`}>Upload</Link>
            </div>
            {report.documents.length === 0 ? (
              <p className={ui.muted}>No documents yet. Upload the demand letter and the bill of quantities.</p>
            ) : (
              <ul className={ui.list}>
                {report.documents.map((d) => (
                  <li key={d.id}>
                    <span className={ui.grow}>
                      {DOCUMENT_LABEL[d.kind]}
                      <span className={ui.muted}> · {d.flat_id ? `Flat ${flatName.get(d.flat_id) ?? ""}` : "Whole project"}</span>
                    </span>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 className={ui.h2}>Clips</h2>
              <Link href={`/projects/${project.id}/upload`}>Upload</Link>
            </div>
            {report.clips.length === 0 ? (
              <p className={ui.muted}>No clips yet. Forward the progress videos you already share with buyers.</p>
            ) : (
              <ul className={ui.list}>
                {/* Which rooms a clip was placed in isn't in the project overview yet; asked of Furqaan. */}
                {report.clips.map((c, i) => (
                  <li key={c.id}>
                    <span className={ui.grow}>
                      Clip {i + 1}
                      <span className={ui.muted}> · {captureTime(c.captured_at)}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * Where the QR code for a room tag is drawn. Drawing a real QR needs a small
 * encoder library; until one is agreed, this shows the code as text in a tag-sized
 * box so the layout and printing are right. The decoder only reads `SP`-prefixed codes.
 */
function TagCode({ code }: { code: string }) {
  return (
    <span className={styles.qr} role="img" aria-label={`QR code ${code}`}>
      <span>QR</span>
    </span>
  );
}
