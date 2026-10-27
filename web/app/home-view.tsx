"use client";

import type { Project } from "@siteproof/contract";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ui } from "@/components/ui";
import { data, DEMO_PROJECT_ID, usingMock } from "@/lib/data";
import { resetMock } from "@/lib/mock-store";

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    data.listProjects().then(setProjects, () => setProjects([]));
  }, []);

  if (!projects || projects.length === 0) return null;
  return (
    <section className={ui.panel}>
      <div className={ui.panelHead}>
        <h2 className={ui.h2}>Projects</h2>
        {usingMock && (
          <button
            type="button"
            className={ui.dangerLink}
            onClick={() => {
              resetMock();
              data.listProjects().then(setProjects, () => setProjects([]));
            }}
          >
            Reset demo data
          </button>
        )}
      </div>
      <ul className={ui.list}>
        {projects.map((p) => (
          <li key={p.id}>
            <span className={ui.grow}>
              <Link href={`/projects/${p.id}`}>{p.name}</Link>
              <span className={ui.muted}>
                {" "}
                · {p.builder} · {p.flats.length === 1 ? `Flat ${p.flats[0].name}` : `${p.flats.length} flats`}
                {p.id === DEMO_PROJECT_ID ? " · demo" : ""}
              </span>
            </span>
            <Link href={`/projects/${p.id}/report`}>Report</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
