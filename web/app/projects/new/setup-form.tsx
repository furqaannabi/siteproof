"use client";

import { Pencil, Plus, X } from "lucide-react";
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

interface RoomDraft {
  key: string;
  name: string;
}

/** A flat. `rooms` is null while it shares the rooms typed once for every flat. */
interface FlatDraft {
  key: string;
  name: string;
  rooms: RoomDraft[] | null;
}

let next = 0;
const key = () => `k${next++}`;

/** Names compare trimmed and case-insensitively, the same rule the server and the document reader use. */
const norm = (s: string) => s.trim().toLowerCase();

function nameError(name: string) {
  if (!name.trim()) return "Needs a name";
  if (name.trim().length > MAX_NAME) return `Keep it under ${MAX_NAME} characters`;
  return null;
}

function validate(name: string, builder: string, shared: RoomDraft[], flats: FlatDraft[]) {
  const errors: Record<string, string> = {};
  const e1 = nameError(name);
  if (e1) errors.name = e1;
  const e2 = nameError(builder);
  if (e2) errors.builder = e2;
  if (flats.length === 0) errors.flats = "Add at least one flat";
  if (shared.length === 0 && flats.some((f) => f.rooms === null)) errors.shared = "Add at least one room";
  const flatNames = new Set<string>();
  for (const f of flats) {
    const fe = nameError(f.name);
    if (fe) errors[f.key] = fe;
    else if (flatNames.has(norm(f.name))) errors[f.key] = "Another flat already has this name";
    else flatNames.add(norm(f.name));
    if (f.rooms !== null && f.rooms.length === 0) errors[f.key] = "This flat needs at least one room";
  }
  return errors;
}

/**
 * "A-101" to "A-108": the same prefix, numbers counting up. Null with a reason when the two
 * don't make a run.
 */
function flatRun(from: string, to: string): { names: string[] } | { problem: string } {
  const a = from.trim().match(/^(.*?)(\d+)$/);
  const b = to.trim().match(/^(.*?)(\d+)$/);
  if (!a || !b) return { problem: "Both need to end in a number, such as 401 and 408" };
  if (a[1] !== b[1]) return { problem: "Both need the same start, such as A-101 and A-108" };
  const [lo, hi] = [Number(a[2]), Number(b[2])];
  if (hi < lo) return { problem: "The second number should be the same as or after the first" };
  if (hi - lo + 1 > MAX_FLATS) return { problem: `A project can have up to ${MAX_FLATS} flats` };
  // Keep leading zeros as typed: 01 to 12 stays 01, 02 … 12.
  const width = a[2].length;
  return { names: Array.from({ length: hi - lo + 1 }, (_, i) => `${a[1]}${String(lo + i).padStart(width, "0")}`) };
}

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [builder, setBuilder] = useState("");
  const [shared, setShared] = useState<RoomDraft[]>([]);
  const [flats, setFlats] = useState<FlatDraft[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Creating a project needs the team's setup key; remembered on this device once it works.
  const [teamKey, setTeamKey] = useState("");
  // Filled after the first render, so the server's HTML and the browser's agree.
  useEffect(() => setTeamKey(setupKey() ?? ""), []);
  const formRef = useRef<HTMLFormElement>(null);

  const check = () => {
    const found = validate(name, builder, shared, flats);
    if (!usingMock && !teamKey.trim()) found.key = "Enter the team's setup key.";
    return found;
  };
  const errors = tried ? check() : {};

  const roomsOf = (f: FlatDraft) => f.rooms ?? shared;
  const tags = flats.reduce((n, f) => n + roomsOf(f).length, 0);
  const updateFlat = (fk: string, change: (f: FlatDraft) => FlatDraft) => setFlats((fs) => fs.map((f) => (f.key === fk ? change(f) : f)));

  /** Adds flats by name, skipping any already listed. Says why when none can be added. */
  function addFlats(names: string[]): string | null {
    const have = new Set(flats.map((f) => norm(f.name)));
    const fresh = names.filter((n) => n.trim() && !have.has(norm(n)));
    if (fresh.length === 0) return names.length === 1 ? "That flat is already listed" : "Those flats are already listed";
    if (flats.length + fresh.length > MAX_FLATS) return `A project can have up to ${MAX_FLATS} flats`;
    const tooLong = fresh.find((n) => nameError(n));
    if (tooLong) return `Flat ${tooLong}: ${nameError(tooLong)?.toLowerCase()}`;
    setFlats((fs) => [...fs, ...fresh.map((n) => ({ key: key(), name: n.trim(), rooms: null }))]);
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (Object.keys(check()).length > 0) {
      // Take the builder straight to the first thing to fix, once the errors have rendered.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const body: CreateProject = {
      name: name.trim(),
      builder: builder.trim(),
      flats: flats.map((f) => ({ name: f.name.trim(), rooms: roomsOf(f).map((r) => ({ name: r.name.trim() })) })),
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
      <div className={styles.side}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Project</h2>
          <Field label="Project name" value={name} onChange={setName} error={errors.name} placeholder="e.g. Green Park, Tower B" />
          <Field label="Builder" value={builder} onChange={setBuilder} error={errors.builder} placeholder="e.g. your company's name" />
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>1 · The rooms in each flat</h2>
          <p className={styles.hint}>
            One printed tag goes at each room&apos;s doorway. Use the room names from the bill of quantities, so each claim matches its room.
          </p>
          <RoomChips label="Rooms in each flat" rooms={shared} onChange={setShared} error={errors.shared} />
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>2 · Which flats</h2>
          <p className={styles.hint}>Add a run of flat numbers, or one flat at a time.</p>
          <AddFlats onAdd={addFlats} />
        </section>
      </div>

      <div className={styles.side}>
        <section className={styles.card} aria-labelledby="flat-list">
          <h2 className={styles.cardTitle} id="flat-list">
            Flats
          </h2>
          {flats.length === 0 ? (
            <p className={styles.hint} aria-invalid={errors.flats ? true : undefined} tabIndex={errors.flats ? -1 : undefined}>
              {errors.flats ? <span className={ui.fieldError}>{errors.flats}. </span> : null}
              No flats yet. Add a run of flat numbers.
            </p>
          ) : (
            <ul className={styles.flats}>
              {flats.map((f) => {
                const own = f.rooms !== null;
                const open = editing === f.key;
                const n = roomsOf(f).length;
                return (
                  <li key={f.key} className={styles.flat} data-open={open || undefined}>
                    <div className={styles.flatRow}>
                      <b>Flat {f.name}</b>
                      <span className={styles.flatRooms}>
                        {n} {n === 1 ? "room" : "rooms"}
                        <span className={own ? styles.own : styles.same}>{own ? "own rooms" : "same rooms"}</span>
                      </span>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-expanded={open}
                        aria-label={`Change the rooms in Flat ${f.name}`}
                        onClick={() => setEditing(open ? null : f.key)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Remove Flat ${f.name}`}
                        onClick={() => setFlats((fs) => fs.filter((x) => x.key !== f.key))}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {errors[f.key] && (
                      <span className={ui.fieldError} role="alert">
                        {errors[f.key]}
                      </span>
                    )}
                    {open && (
                      <div className={styles.flatEdit}>
                        <Field label="Flat number" value={f.name} onChange={(v) => updateFlat(f.key, (x) => ({ ...x, name: v }))} />
                        <RoomChips
                          label={`Rooms in Flat ${f.name}`}
                          rooms={roomsOf(f)}
                          // Changing a shared flat's rooms gives it its own copy; the rest keep sharing.
                          onChange={(rooms) => updateFlat(f.key, (x) => ({ ...x, rooms: rooms.map((r) => ({ ...r })) }))}
                        />
                        {own && (
                          <button type="button" className={styles.textButton} onClick={() => updateFlat(f.key, (x) => ({ ...x, rooms: null }))}>
                            Use the same rooms as the other flats
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {flats.length > 0 && (
            <p className={styles.total}>
              <b>{flats.length}</b> {flats.length === 1 ? "flat" : "flats"} · <b>{tags}</b> {tags === 1 ? "tag" : "tags"} to print
            </p>
          )}
        </section>

        {!usingMock && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Setup key</h2>
            <p className={styles.hint}>Only the SiteProof team can set up a project. This phone remembers the key once it works.</p>
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
            Some things need attention. Each one has a note beside it.
          </p>
        )}

        <div className={styles.submitBar}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving ? "Creating…" : "Create the project and its tags"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Rooms as chips: type a name and press Enter. Quick-add buttons for the usual rooms. */
function RoomChips({ label, rooms, onChange, error }: { label: string; rooms: RoomDraft[]; onChange: (rooms: RoomDraft[]) => void; error?: string }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const present = new Set(rooms.map((r) => norm(r.name)));
  const suggestions = COMMON_ROOMS.filter((r) => !present.has(norm(r)));

  function add(raw: string) {
    const name = raw.trim();
    if (!name) return;
    const why = nameError(name) ?? (present.has(norm(name)) ? "This flat already has a room with this name" : rooms.length >= MAX_ROOMS ? `A flat can have up to ${MAX_ROOMS} rooms` : null);
    if (why) {
      setProblem(why);
      return;
    }
    onChange([...rooms, { key: key(), name }]);
    setText("");
    setProblem(null);
  }

  const shown = problem ?? error;
  return (
    <div className={styles.roomField}>
      <label htmlFor={inputId} className={styles.visuallyHidden}>
        {label}
      </label>
      <div className={styles.chipBox} data-invalid={shown ? true : undefined}>
        {rooms.map((r) => (
          <span key={r.key} className={styles.roomChip}>
            {r.name}
            <button type="button" aria-label={`Remove ${r.name}`} onClick={() => onChange(rooms.filter((x) => x.key !== r.key))}>
              <X size={12} strokeWidth={3} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          className={styles.chipInput}
          value={text}
          placeholder={rooms.length ? "Add another room" : "Type a room, press Enter"}
          enterKeyHint="done"
          maxLength={MAX_NAME + 20}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && rooms.length) onChange(rooms.slice(0, -1));
          }}
          onBlur={() => add(text)}
        />
      </div>
      {shown && (
        <span id={errorId} className={ui.fieldError}>
          {shown}
        </span>
      )}
      {suggestions.length > 0 && (
        <div className={styles.quick}>
          <span className={styles.hint}>Quick add:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" className={styles.quickChip} disabled={rooms.length >= MAX_ROOMS} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A run of flats ("401" to "408"), or one flat by name. */
function AddFlats({ onAdd }: { onAdd: (names: string[]) => string | null }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [one, setOne] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function addRun() {
    const run = flatRun(from, to || from);
    const why = "problem" in run ? run.problem : onAdd(run.names);
    setProblem(why);
    if (!why) {
      setFrom("");
      setTo("");
    }
  }

  function addOne() {
    if (!one.trim()) return;
    const why = onAdd([one]);
    setProblem(why);
    if (!why) setOne("");
  }

  const enter = (go: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div className={styles.addFlats}>
      <div className={styles.run}>
        <label className={ui.field}>
          <span>From</span>
          <input className={ui.input} value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={enter(addRun)} placeholder="e.g. 401" />
        </label>
        <label className={ui.field}>
          <span>To</span>
          <input className={ui.input} value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={enter(addRun)} placeholder="e.g. 408" />
        </label>
        <button type="button" className={styles.addButton} onClick={addRun} disabled={!from.trim()}>
          <Plus size={18} aria-hidden="true" />
          Add these flats
        </button>
      </div>
      <div className={styles.run}>
        <label className={`${ui.field} ${styles.wide}`}>
          <span>Or one flat</span>
          <input className={ui.input} value={one} onChange={(e) => setOne(e.target.value)} onKeyDown={enter(addOne)} placeholder="e.g. Penthouse" />
        </label>
        <button type="button" className={styles.addButtonQuiet} onClick={addOne} disabled={!one.trim()}>
          Add
        </button>
      </div>
      {problem && (
        <span className={ui.fieldError} role="alert">
          {problem}
        </span>
      )}
    </div>
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
