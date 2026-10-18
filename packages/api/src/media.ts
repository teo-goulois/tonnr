import { ORPCError } from "@orpc/server";
import { MEDIA_KINDS, type MediaVariant, SESSION_MOST_MEDIA } from "@repo/config/media";
import type { Database } from "@repo/db";
import {
  MEDIA_CHANNEL,
  MEDIA_FAILURES,
  type MediaFiles,
  media,
  mediaPause,
} from "@repo/db/schema/media";
import type { Storage } from "@repo/media/storage";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

// What the API says of the photos and the videos it keeps, and how it lets them be read:
// decision 066.

const HOUR_MS = 60 * 60 * 1000;

/** How long an address that takes an upload works. A video of a minute goes up in less. */
export const UPLOAD_SECONDS = 15 * 60;

/** How many files an account may ask to send in an hour. */
export const UPLOADS_PER_HOUR = 40;

/**
 * How much every account together may send in a day, in UTC, before the instance takes no more
 * until the next: what one VPS processes, and what the bucket grows by at most. It is written
 * here and is no setting.
 */
export const INSTANCE_DAILY_BYTES = 20 * 1024 * 1024 * 1024;

/** How a medium stands, as a screen says it. */
export const MEDIA_SHOWN_STATES = ["uploading", "processing", "ready", "failed"] as const;

/** A photo or a video as the API answers it, with addresses that read its files. */
export const mediaItemSchema = z.object({
  id: z.string(),
  kind: z.enum(MEDIA_KINDS),
  // `uploading` until the browser said its file is in, `processing` until the worker made what
  // is shown, then `ready`, or `failed` with the reason in `failure`.
  state: z.enum(MEDIA_SHOWN_STATES),
  failure: z.enum(MEDIA_FAILURES).nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  // Addresses of the bucket that read each file, each good for an hour at least and the same all
  // through the hour, so that a browser keeps the file. Null until it is ready, and for a form
  // the kind has not: a photo has `thumb` and `display`, a video `thumb`, `poster` and `video`.
  thumb: z.string().nullable(),
  display: z.string().nullable(),
  poster: z.string().nullable(),
  video: z.string().nullable(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

type Row = typeof media.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** How a medium stands, as a screen says it. */
export function shownState(row: Pick<Row, "state">): MediaItem["state"] {
  if (row.state === "awaiting_upload") return "uploading";
  if (row.state === "uploaded") return "processing";
  return row.state;
}

/**
 * The moment the addresses given now are signed at: the start of the hour. An address is then
 * the same all through the hour, and good for `hoursAfter` hours after it ends.
 */
export function signedAt(now: number) {
  return new Date(Math.floor(now / HOUR_MS) * HOUR_MS);
}

/**
 * What the API answers of some media: addresses that read the files of each one that is ready,
 * signed so that an address given at any moment of an hour works an hour after it at least.
 */
export async function describeMedia(
  storage: Storage | null | undefined,
  rows: readonly Row[],
  now: number,
  hoursAfter = 1,
): Promise<MediaItem[]> {
  const at = signedAt(now);
  const seconds = Math.round(((hoursAfter + 1) * HOUR_MS) / 1000);
  const address = async (files: MediaFiles, variant: MediaVariant) => {
    const file = files[variant];
    if (!storage || !file) return null;
    return storage.readUrl(file.key, at, seconds);
  };
  return Promise.all(
    rows.map(async (row) => {
      const ready = row.state === "ready";
      const files = ready ? row.files : {};
      return {
        id: row.id,
        kind: row.kind,
        state: shownState(row),
        failure: row.failure,
        width: row.width,
        height: row.height,
        durationMs: row.durationMs,
        thumb: await address(files, "thumb"),
        display: await address(files, "display"),
        poster: await address(files, "poster"),
        video: await address(files, "video"),
      };
    }),
  );
}

/** The bucket, or the refusal of an instance that keeps no media. */
export function storageOf(storage: Storage | null | undefined) {
  if (!storage) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "This instance keeps no photos or videos.",
      data: { media: "none" },
    });
  }
  return storage;
}

/** Since when an operator has uploads stopped for every account. Null while none has. */
export async function uploadsPausedAt(db: Pick<Database, "select">) {
  const [pause] = await db.select({ at: mediaPause.at }).from(mediaPause);
  return pause?.at ?? null;
}

/** Whether an operator stopped uploads for every account. */
export async function uploadsPaused(db: Pick<Database, "select">) {
  return (await uploadsPausedAt(db)) !== null;
}

/** Tells the worker that a file waits for it. A worker that is not there finds it within a minute. */
export async function wakeWorker(db: Pick<Database, "execute">) {
  await db.execute(sql`select pg_notify(${MEDIA_CHANNEL}, '')`);
}

/** The ids of the media a session is given: as many as it keeps at most, each once. */
export const mediaIdsSchema = z
  .array(z.string())
  .max(SESSION_MOST_MEDIA)
  .refine((ids) => new Set(ids).size === ids.length, "each photo or video once");

/**
 * Gives a session the media it lists, in that order, and deletes those of it that the list no
 * longer names. Each is the account's own, sent for a session, and belongs to no other session.
 * The caller holds the account, then the session: the media are held after them, in the order of
 * their ids, so that two requests that give the same never wait on each other.
 */
export async function giveSessionMedia(
  tx: Transaction,
  userId: string,
  sessionId: string,
  mediaIds: readonly string[],
) {
  const rows =
    mediaIds.length === 0
      ? []
      : await tx
          .select({ id: media.id, sessionId: media.sessionId, purpose: media.purpose })
          .from(media)
          .where(and(inArray(media.id, [...mediaIds]), eq(media.userId, userId)))
          .orderBy(asc(media.id))
          .for("update");
  const missing = mediaIds.find((id) => !rows.some((row) => row.id === id));
  if (missing !== undefined) {
    throw new ORPCError("NOT_FOUND", { message: `No photo or video "${missing}".` });
  }
  if (rows.some((row) => row.purpose !== "session" || (row.sessionId ?? sessionId) !== sessionId)) {
    throw new ORPCError("CONFLICT", {
      message: "A photo or a video belongs to one session, and was sent for it.",
    });
  }
  await tx
    .delete(media)
    .where(
      and(
        eq(media.sessionId, sessionId),
        mediaIds.length > 0 ? notInArray(media.id, [...mediaIds]) : undefined,
      ),
    );
  for (const [position, id] of mediaIds.entries()) {
    await tx.update(media).set({ sessionId, position }).where(eq(media.id, id));
  }
}
