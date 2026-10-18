import { REPORT_SHOWN_HOURS } from "@repo/config/media";
import type { Database } from "@repo/db";
import { user } from "@repo/db/schema/auth";
import { media } from "@repo/db/schema/media";
import {
  REPORT_REASONS,
  REPORT_STATES,
  type ReportReason,
  surfReport,
  surfReportFlag,
} from "@repo/db/schema/reports";
import { SURF_SIZES } from "@repo/db/schema/sessions";
import type { Storage } from "@repo/media/storage";
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";

import { describeMedia, mediaItemSchema } from "./media";

// What the API says of the reports at a break: decision 067.

const HOUR_MS = 60 * 60 * 1000;

/** How many accounts' flags hide a report until an operator decides. */
export const FLAGS_HIDE = 3;

/** A report as anyone reads it, with what its author alone reads of it. */
export const reportSchema = z.object({
  id: z.string(),
  breakId: z.string(),
  createdAt: z.date(),
  // The username it is read under. Null for an account that has none any more.
  author: z.string().nullable(),
  waveSize: z.enum(SURF_SIZES).nullable(),
  setSize: z.enum(SURF_SIZES).nullable(),
  note: z.string().nullable(),
  // How far from the break its photos were taken, the furthest, in kilometres. Null while it is
  // checked.
  distanceKm: z.number().nullable(),
  media: z.array(mediaItemSchema),
  // Whether the caller wrote it, and, for its author alone, where it stands and why it is not
  // shown. Anyone else reads only reports that are shown.
  mine: z.boolean(),
  state: z.enum(REPORT_STATES),
  reasons: z.array(z.enum(REPORT_REASONS)),
  // Whether the caller said it should not be shown.
  flagged: z.boolean(),
});
export type Report = z.infer<typeof reportSchema>;

type ReportRow = typeof surfReport.$inferSelect;
type MediaRow = typeof media.$inferSelect;

/** The reasons its media were not shown for, each once, in the order the list gives them. */
export function reasonsOf(rows: readonly MediaRow[]) {
  const found = new Set<ReportReason>();
  for (const row of rows) {
    if (row.state === "failed") found.add("unreadable");
    for (const reason of row.checks?.reasons ?? []) found.add(reason);
  }
  return REPORT_REASONS.filter((reason) => found.has(reason));
}

/** How far from the break its photos were taken, the furthest. */
export function distanceOf(rows: readonly MediaRow[]) {
  const distances = rows.flatMap((row) =>
    row.checks?.position.distanceKm != null ? [row.checks.position.distanceKm] : [],
  );
  return distances.length > 0 ? Math.max(...distances) : null;
}

/**
 * The reports given, with their media, their authors' usernames and what the caller said of
 * each. Addresses of the bucket are signed for `hoursAfter` hours after the hour.
 */
export async function describeReports(
  db: Pick<Database, "select">,
  storage: Storage | null | undefined,
  rows: readonly ReportRow[],
  options: { callerId: string | null; now: number; hoursAfter?: number },
): Promise<Report[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const [mediaRows, authors, flags] = await Promise.all([
    db
      .select()
      .from(media)
      .where(inArray(media.reportId, ids))
      .orderBy(asc(media.position), asc(media.createdAt)),
    db.select({ id: user.id, username: user.username }).from(user).where(inArray(user.id, userIds)),
    options.callerId
      ? db
          .select({ reportId: surfReportFlag.reportId })
          .from(surfReportFlag)
          .where(
            and(inArray(surfReportFlag.reportId, ids), eq(surfReportFlag.userId, options.callerId)),
          )
      : Promise.resolve([]),
  ]);
  const described = await describeMedia(storage, mediaRows, options.now, options.hoursAfter);
  return rows.map((row) => {
    const mine = mediaRows.filter((one) => one.reportId === row.id);
    const isMine = row.userId === options.callerId;
    return {
      id: row.id,
      breakId: row.breakId,
      createdAt: row.createdAt,
      author: authors.find((one) => one.id === row.userId)?.username ?? null,
      waveSize: row.waveSize,
      setSize: row.setSize,
      note: row.note,
      distanceKm: distanceOf(mine),
      // Only what is ready is shown to another than its author.
      media: mediaRows.flatMap((one, index) =>
        one.reportId === row.id && (isMine || one.state === "ready") ? [described[index]!] : [],
      ),
      mine: isMine,
      state: row.state,
      reasons: isMine ? reasonsOf(mine) : [],
      flagged: flags.some((flag) => flag.reportId === row.id),
    };
  });
}

/** The oldest moment a report is shown from: a week. */
export function shownSince(now: number) {
  return new Date(now - REPORT_SHOWN_HOURS * HOUR_MS);
}

/** How many accounts said a report should not be shown, since an operator last restored it. */
export async function flagsOf(
  db: Pick<Database, "select">,
  row: Pick<ReportRow, "id" | "restoredAt">,
) {
  const [counted] = await db
    .select({ flags: count() })
    .from(surfReportFlag)
    .where(
      and(
        eq(surfReportFlag.reportId, row.id),
        row.restoredAt ? gt(surfReportFlag.createdAt, row.restoredAt) : undefined,
      ),
    );
  return counted?.flags ?? 0;
}

/** Whether a report is written as the API says: a note with no address in it. */
export function hasAddress(note: string) {
  return /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|fr|es|pt|app|co|me|ly|gg)\b)/i.test(
    note,
  );
}
