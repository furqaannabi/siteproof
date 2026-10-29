"use client";

import type { Report, Room } from "@siteproof/contract";
import { Camera, Check, MapPin, RotateCw, Video } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { ErrorPanel, Loading, LogoMark, StaleNotice, useFlatReport, useOverview } from "@/components/ui";
import { CLIP_ACCEPT, useUploads } from "@/components/uploads";
import { usingMock } from "@/lib/data";
import { autoLayout } from "@/lib/room-layout";
import { allRows } from "../../../report/report-view";
import { Track } from "../../../upload/upload-view";
import uploadStyles from "../../../upload/upload.module.css";
import styles from "./request.module.css";

export function RequestPage({ projectId, roomId }: { projectId: string; roomId: string }) {
  // The project says which flat the room is in; that flat's report holds its gap request.
  const project = useOverview(projectId);
  const room = project.overview?.rooms.find((r) => r.id === roomId) ?? null;
  const flatReport = useFlatReport(projectId, room?.flat ?? null);
  const error = project.error ?? flatReport.error;
  const stale = project.stale || flatReport.stale;
  const reload = useCallback(() => {
    void project.reload();
    void flatReport.reload();
  }, [project.reload, flatReport.reload]);

  if (error) {
    return (
      <main className={styles.screen}>
        <ErrorPanel error={error} retry={reload} />
      </main>
    );
  }
  if (!project.overview || (room && !flatReport.report)) return <Loading what="Loading the request" />;
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <RequestView projectId={projectId} room={room} report={flatReport.report} onSettled={reload} />
    </>
  );
}

function RequestView({
  projectId,
  room,
  report,
  onSettled,
}: {
  projectId: string;
  room: Room | null;
  report: Report | null;
  onSettled: () => void;
}) {
  const settled = useCallback(() => onSettled(), [onSettled]);
  const uploads = useUploads(projectId, settled);
  const roomId = room?.id ?? "";
  const flat = report?.flat;
  // A cleared request has done its job: the room's footage arrived.
  const gap = report?.gap_requests.find((g) => g.room_id === roomId && g.status !== "cleared");
  const roomName = room?.name ?? "this room";
  const lower = roomName.toLowerCase();
  const sentDone = uploads.items.some((x) => x.status === "done");
  // Only a room the report has judged from a complete sweep is "covered"; one still Not
  // seen yet with no request open is waiting for the builder, never called covered.
  const roomRows = report ? allRows(report).filter((r) => r.room.id === roomId) : [];
  const unseen = roomRows.some((r) => r.result.outcome === "not_seen");
  const covered = roomRows.length > 0 && !unseen;
  const reportHref = `/projects/${projectId}/report${flat ? `?flat=${flat.id}` : ""}`;

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.barIn}>
          <Link href={reportHref} className={styles.brand}>
            <LogoMark />
            SiteProof
          </Link>
          <span className={styles.where}>
            {report && <span className={styles.project}>{report.project.name}</span>}
            {flat && <span className={styles.flatName}>Flat {flat.name}</span>}
          </span>
        </div>
      </header>

      <main className={styles.screen}>
        {!room ? (
          <div className={styles.ticket}>
            <div className={styles.message}>
              <h1 className={styles.messageTitle}>This room isn&apos;t in the project</h1>
              <p>The link may be out of date. Ask for a new one.</p>
            </div>
          </div>
        ) : !gap ? (
          <div className={styles.ticket}>
            <div className={styles.message}>
              {(sentDone || covered) && (
                <span className={styles.covered} aria-hidden="true">
                  <Check size={42} strokeWidth={3} />
                </span>
              )}
              <span className={styles.eyebrow}>{sentDone ? "Thank you" : covered ? "Nothing needed" : "No request yet"}</span>
              <h1 className={styles.messageTitle}>
                {sentDone ? "The clip is in" : covered ? `No footage needed for the ${lower}` : `Nothing has been asked for the ${lower} yet`}
              </h1>
              <p>
                {sentDone
                  ? "It was checked and the report is updated for the builder."
                  : covered
                    ? "This room is already covered by a one-way sweep."
                    : "The builder will send a link with exactly what to film."}
              </p>
              <Link href={reportHref} className={styles.secondary}>
                See the report
              </Link>
            </div>
          </div>
        ) : (
          <article className={styles.ticket} aria-labelledby="ask">
            <div className={styles.head}>
              <b>Footage needed</b>
              <span>From the builder</span>
            </div>
            <div className={styles.grid}>
              <div>
                <small>Flat</small>
                <b>{flat?.name ?? "—"}</b>
              </div>
              <div>
                <small>Room</small>
                <b>{roomName}</b>
              </div>
            </div>

            {report && report.rooms.length > 1 && <WhichRoom rooms={report.rooms} roomId={roomId} roomName={lower} />}

            <div className={styles.what}>
              <small>Film</small>
              <h1 id="ask" className={styles.ask}>
                {gap.text}
              </h1>
            </div>

            {uploads.items.length === 0 ? (
              <ol className={styles.steps}>
                {gap.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : (
              <ul className={styles.sent}>
                {uploads.items.map((item) => (
                  <li key={item.key} className={`${uploadStyles.sheet} ${styles.clip}`}>
                    <span className={styles.clipIcon} aria-hidden="true">
                      <Video size={22} />
                    </span>
                    <div className={uploadStyles.filmBody}>
                      <b>{item.label}</b>
                      {item.detail && <small>{item.detail}</small>}
                      <Track item={item} labels={["Sent", "Checking", "Placed in rooms"]} />
                      {item.error && <p className={styles.error}>{item.error}</p>}
                      {item.retryable && (
                        <button type="button" className={styles.retry} onClick={() => uploads.retry(item.key)}>
                          <RotateCw size={16} aria-hidden="true" />
                          Try again
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.foot}>
              <span>One clip clears the {lower}</span>
              <span>Pan one way only</span>
            </div>
          </article>
        )}
      </main>

      {room && gap && (
        <div className={styles.recordBar}>
          <div className={styles.recordIn}>
            <label className={styles.record}>
              <Camera size={22} aria-hidden="true" />
              {uploads.items.length > 0 ? "Record or upload another" : "Record or upload clip"}
              <input
                type="file"
                accept={CLIP_ACCEPT}
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // In the mock, the clip is credited to this room. The real pipeline reads the room tag in the footage.
                  if (file) uploads.addClip(projectId, file, usingMock ? roomId : null);
                  e.target.value = "";
                }}
              />
            </label>
            <small>Any phone video works. WhatsApp clips are fine.</small>
          </div>
        </div>
      )}
    </>
  );
}

const CELL = 10;
const COS30 = Math.cos(Math.PI / 6);

/**
 * The flat from above at an angle, with the room to film lit. The plan isn't to scale and
 * SiteProof doesn't know where the door or any wall is, so it marks the room, never a spot in it.
 */
function WhichRoom({ rooms, roomId, roomName }: { rooms: Room[]; roomId: string; roomName: string }) {
  const rects = autoLayout(rooms.length, CELL, CELL);
  const iso = (x: number, z: number): [number, number] => [(x - z) * COS30, (x + z) * 0.5];
  const quad = (r: (typeof rects)[number]) => [iso(r.x, r.z), iso(r.x + r.w, r.z), iso(r.x + r.w, r.z + r.d), iso(r.x, r.z + r.d)];
  const all = rects.flatMap(quad);
  const [minX, maxX] = [Math.min(...all.map((p) => p[0])) - 3, Math.max(...all.map((p) => p[0])) + 3];
  const [minY, maxY] = [Math.min(...all.map((p) => p[1])) - 9, Math.max(...all.map((p) => p[1])) + 3];
  const i = rooms.findIndex((r) => r.id === roomId);
  const target = rects[i];
  const [px, py] = target ? iso(target.x + target.w / 2, target.z + target.d / 2) : [0, 0];
  return (
    <figure className={styles.map}>
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={`The flat from above, with the ${roomName} marked. Not to scale.`}>
        {rects.map((r, k) => (
          <polygon key={k} className={styles.mapRoom} data-here={k === i || undefined} points={quad(r).map((p) => p.join(",")).join(" ")} />
        ))}
        {rects.map((r, k) => {
          const [cx, cy] = iso(r.x + r.w / 2, r.z + r.d / 2);
          return (
            <text key={k} className={styles.mapName} data-here={k === i || undefined} x={cx} y={cy + (k === i ? 2.6 : 0.9)}>
              {rooms[k].name}
            </text>
          );
        })}
        {target && (
          <g transform={`translate(${px} ${py - 4.5})`}>
            <MapPin className={styles.pin} x={-3.2} y={-3.2} width={6.4} height={6.4} strokeWidth={2.4} />
          </g>
        )}
      </svg>
      <figcaption>
        <b>Film this room: the {roomName}</b>
        <span>Plan not to scale</span>
      </figcaption>
    </figure>
  );
}
