"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui";
import { data } from "@/lib/data";
import type { CreateProject } from "@/lib/types";
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

  const errors = tried ? validate(name, builder, flats) : {};

  const updateFlat = (fk: string, change: (f: FlatDraft) => FlatDraft) => setFlats((fs) => fs.map((f) => (f.key === fk ? change(f) : f)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (Object.keys(validate(name, builder, flats)).length > 0) return;
    const body: CreateProject = {
      name: name.trim(),
      builder: builder.trim(),
      flats: flats.map((f) => ({ name: f.name.trim(), rooms: f.rooms.map((r) => ({ name: r.name.trim() })) })),
    };
    setSaving(true);
    try {
      const { project } = await data.createProject(body);
      router.push(`/projects/${project.id}?created=1`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't create the project. Try again.");
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <section className={ui.panel}>
        <h2 className={ui.h2}>Project</h2>
        <div className={ui.row}>
          <Field label="Project name" value={name} onChange={setName} error={errors.name} placeholder="Northfield Residency, Tower B" />
          <Field label="Builder" value={builder} onChange={setBuilder} error={errors.builder} placeholder="Northfield Constructions Pvt. Ltd." />
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
            <Field label="Flat number" value={f.name} onChange={(v) => updateFlat(f.key, (x) => ({ ...x, name: v }))} error={errors[f.key]} placeholder="302" />

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
                    placeholder="Bedroom 2"
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

      {serverError && (
        <div className={ui.errorPanel} role="alert">
          {serverError}
        </div>
      )}
      {tried && Object.keys(errors).length > 0 && (
        <p className={ui.fieldError} role="alert">
          Fix the highlighted names, then create the project.
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <label className={ui.field}>
      <span>{label}</span>
      <input
        className={ui.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_NAME + 20}
        aria-invalid={error ? true : undefined}
      />
      {error && <span className={ui.fieldError}>{error}</span>}
    </label>
  );
}
