"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ui } from "@/components/ui";
import { saveBuilderToken, saveSetupKey, setupKey } from "@/lib/access";
import { data, DataError, usingMock } from "@/lib/data";
import type { CreateProject } from "@siteproof/contract";
import styles from "./setup.module.css";

const COMMON_ROOMS = ["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Bathroom"];

// The backend's limits, from the ADR of 27 October. Checked here so the builder hears
// about a problem next to the field, before anything is sent.
const MAX_NAME = 80;
const MAX_FLATS = 50;
const MAX_ROOMS = 30;

interface FlatDraft {
  key: string;
  name: string;
  rooms: { key: string; name: string }[];
}

let next = 0;
const key = () => `k${next++}`;
const emptyFlat = (): FlatDraft => ({ key: key(), name: "", rooms: [{ key: key(), name: "" }] });

/** Names compare trimmed and case-insensitively, the same rule the server and the document reader use. */
const norm = (s: string) => s.trim().toLowerCase();

function nameError(name: string) {
  if (!name.trim()) return "Needs a name";
  if (name.trim().length > MAX_NAME) return `Keep it under ${MAX_NAME} characters`;
  return null;
}

function validate(name: string, builder: string, flats: FlatDraft[]) {
  const errors: Record<string, string> = {};
  const e1 = nameError(name);
  if (e1) errors.name = e1;
  const e2 = nameError(builder);
  if (e2) errors.builder = e2;
  const flatNames = new Map<string, string>();
  for (const f of flats) {
    const fe = nameError(f.name);
    if (fe) errors[f.key] = fe;
    else if (flatNames.has(norm(f.name))) errors[f.key] = "Another flat already has this name";
    else flatNames.set(norm(f.name), f.key);
    const roomNames = new Set<string>();
    for (const r of f.rooms) {
      const re = nameError(r.name);
      if (re) errors[r.key] = re;
      else if (roomNames.has(norm(r.name))) errors[r.key] = "This flat already has a room with this name";
      else roomNames.add(norm(r.name));
    }
  }
  return errors;
}

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [builder, setBuilder] = useState("");
  const [flats, setFlats] = useState<FlatDraft[]>([emptyFlat()]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Creating a project needs the team's setup key; remembered on this device once it works.
  const [teamKey, setTeamKey] = useState("");
  // Filled after the first render, so the server's HTML and the browser's agree.
  useEffect(() => setTeamKey(setupKey() ?? ""), []);
  const formRef = useRef<HTMLFormElement>(null);

  const check = () => {
    const found = validate(name, builder, flats);
    if (!usingMock && !teamKey.trim()) found.key = "Enter the team's setup key.";
    return found;
  };
  const errors = tried ? check() : {};

  const updateFlat = (fk: string, change: (f: FlatDraft) => FlatDraft) => setFlats((fs) => fs.map((f) => (f.key === fk ? change(f) : f)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (Object.keys(check()).length > 0) {
      // Take the builder straight to the first thing to fix, once the errors have rendered.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const body: CreateProject = {
      name: name.trim(),
      builder: builder.trim(),
      flats: flats.map((f) => ({ name: f.name.trim(), rooms: f.rooms.map((r) => ({ name: r.name.trim() })) })),
    };
    setSaving(true);
    try {
      const { project } = await data.createProject(body, teamKey.trim());
      // The new project's builder link, so this device can open it; the setup key asks for it.
      const links = await data.getLinks(project.id, usingMock ? undefined : teamKey.trim());
      saveBuilderToken(project.id, links.builder_token);
      if (!usingMock) saveSetupKey(teamKey.trim());
      router.push(`/projects/${project.id}?created=1`);
    } catch (err) {
      if (err instanceof DataError && err.status === 401) {
        saveSetupKey(null);
        setServerError("That setup key isn't right. Check it with the SiteProof team.");
      } else setServerError(err instanceof Error ? err.message : "Couldn't create the project. Try again.");
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate ref={formRef}>
      <section className={ui.panel}>
        <h2 className={ui.h2}>Project</h2>
        <div className={ui.row}>
          <Field label="Project name" value={name} onChange={setName} error={errors.name} placeholder="e.g. Green Park, Tower B" />
          <Field label="Builder" value={builder} onChange={setBuilder} error={errors.builder} placeholder="e.g. your company's name" />
        </div>
      </section>

      {flats.map((f, fi) => {
        const present = new Set(f.rooms.map((r) => norm(r.name)));
        const suggestions = COMMON_ROOMS.filter((r) => !present.has(norm(r)));
        return (
          <section key={f.key} className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 className={ui.h2}>Flat {f.name.trim() || fi + 1}</h2>
              {flats.length > 1 && (
                <button type="button" className={ui.dangerLink} onClick={() => setFlats((fs) => fs.filter((x) => x.key !== f.key))}>
                  Remove flat
                </button>
              )}
            </div>
            <Field label="Flat number" value={f.name} onChange={(v) => updateFlat(f.key, (x) => ({ ...x, name: v }))} error={errors[f.key]} placeholder="e.g. 302" />

            <fieldset className={styles.rooms}>
              <legend className={styles.legend}>Rooms</legend>
              <p className={ui.muted}>One printed tag goes at each room&apos;s doorway. Use the room names from the bill of quantities, so claims match their room.</p>
              {f.rooms.map((r, ri) => (
                <div key={r.key} className={styles.roomRow}>
                  <Field
                    label={`Room ${ri + 1}`}
                    value={r.name}
                    onChange={(v) => updateFlat(f.key, (x) => ({ ...x, rooms: x.rooms.map((y) => (y.key === r.key ? { ...y, name: v } : y)) }))}
                    error={errors[r.key]}
                    placeholder="e.g. Bedroom 2"
                  />
                  {f.rooms.length > 1 && (
                    <button
                      type="button"
                      className={ui.dangerLink}
                      aria-label={`Remove room ${r.name || ri + 1}`}
                      onClick={() => updateFlat(f.key, (x) => ({ ...x, rooms: x.rooms.filter((y) => y.key !== r.key) }))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <div className={ui.row}>
                <button
                  type="button"
                  className={ui.secondaryButton}
                  disabled={f.rooms.length >= MAX_ROOMS}
                  onClick={() => updateFlat(f.key, (x) => ({ ...x, rooms: [...x.rooms, { key: key(), name: "" }] }))}
                >
                  Add a room
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className={styles.chips}>
                  <span className={ui.muted}>Quick add:</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={styles.chip}
                      disabled={f.rooms.length >= MAX_ROOMS}
                      onClick={() =>
                        updateFlat(f.key, (x) => {
                          const blank = x.rooms.find((y) => !y.name.trim());
                          return blank
                            ? { ...x, rooms: x.rooms.map((y) => (y.key === blank.key ? { ...y, name: s } : y)) }
                            : { ...x, rooms: [...x.rooms, { key: key(), name: s }] };
                        })
                      }
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          </section>
        );
      })}

      <div className={ui.row}>
        <button type="button" className={ui.secondaryButton} disabled={flats.length >= MAX_FLATS} onClick={() => setFlats((fs) => [...fs, emptyFlat()])}>
          Add another flat
        </button>
      </div>

      {!usingMock && (
        <section className={ui.panel}>
          <h2 className={ui.h2}>Setup key</h2>
          <p className={ui.muted}>Only the SiteProof team can set up a project. This phone remembers the key once it works.</p>
          <Field label="Team setup key" type="password" value={teamKey} onChange={setTeamKey} error={errors.key} />
        </section>
      )}

      {serverError && (
        <div className={ui.errorPanel} role="alert">
          {serverError}
        </div>
      )}
      {tried && Object.keys(errors).length > 0 && (
        <p className={ui.fieldError} role="alert">
          Some names need attention. Each one has a note under it.
        </p>
      )}

      <div className={styles.submitBar}>
        <button type="submit" className={ui.markButton} disabled={saving}>
          {saving ? "Creating…" : "Create project and room tags"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  type?: "text" | "password";
}) {
  const errorId = useId();
  return (
    <label className={ui.field}>
      <span>{label}</span>
      <input
        className={ui.input}
        type={type}
        autoComplete={type === "password" ? "off" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_NAME + 20}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <span id={errorId} className={ui.fieldError}>
          {error}
        </span>
      )}
    </label>
  );
}
