import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

import { MEDIA_MOST_BYTES, VIDEO_MOST_SECONDS } from "@repo/config/media";
import { connectionOf, type Database } from "@repo/db";
import {
  media,
  type MediaFailure,
  type MediaFile,
  type MediaFiles,
  mediaSentDay,
  mediaSentHour,
  mediaTrash,
} from "@repo/db/schema/media";
import { reportSent, surfReport } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import type { Analyser } from "@repo/media/analysis";
import { readPhoto, readVideo, type Taken } from "@repo/media/metadata";
import { PhotoRefused, renderPhoto } from "@repo/media/photo";
import {
  checkPosition,
  checkTime,
  judgeMedium,
  judgeReport,
  type MediaChecks,
} from "@repo/media/report-checks";
import type { Storage } from "@repo/media/storage";
import { DEFAULT_TOOLS, type Tools, VideoRefused, renderVideo } from "@repo/media/video";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import pg from "pg";

import type { Done } from "./runs";
import { StoreError } from "./store";

// What the worker does with the photos and the videos accounts send: makes of each what is shown,
// one at a time, lets go of what was never used, and deletes from the bucket what nothing keeps.
// Decision 066.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** How long a worker holds a medium it took: longer than the longest a video takes. */
const CLAIM_MINUTES = 20;
/** How many times a medium is tried before the worker gives up on it. */
export const MOST_ATTEMPTS = 3;
/** How long a run takes media one after the other, before it leaves the rest to the next. */
const RUN_MS = 8 * MINUTE_MS;
/** How long a medium sent for nothing yet waits for the form it was sent from. */
const UNUSED_MS = DAY_MS;
/** How many keys a run deletes from the bucket at most. */
const TRASH_AT_ONCE = 500;

type Row = typeof media.$inferSelect;

/** What one run did. */
export type MediaRun = {
  ready: number;
  failed: number;
  retried: number;
  abandoned: number;
  // Reports older than the instance keeps them, deleted with their files.
  purged: number;
  trashed: number;
  // Lists of keys the bucket would not delete this time, and lists left for the next runs.
  trashFailed: number;
  trashLeft: number;
};

/** Takes the medium that waited longest, for this worker alone, until the claim runs out. */
async function claimNext(db: Database, claim: string) {
  const [row] = await db
    .update(media)
    .set({
      claim,
      claimedUntil: sql`now() + make_interval(mins => ${CLAIM_MINUTES})`,
      attempts: sql`${media.attempts} + 1`,
    })
    .where(
      eq(
        media.id,
        sql`(select ${media.id} from ${media}
          where ${media.state} = 'uploaded'
            and (${media.purpose} = 'session' or ${media.reportId} is not null)
            and ${media.attempts} < ${MOST_ATTEMPTS}
            and (${media.claimedUntil} is null or ${media.claimedUntil} < now())
          order by ${media.uploadedAt} limit 1 for update skip locked)`,
      ),
    )
    .returning();
  return row ?? null;
}

/** Writes a file of the bucket from a stream of it, into the work folder. */
async function download(storage: Storage, row: Row, path: string) {
  const stream = await storage.read(row.uploadKey, row.uploadEtag ?? undefined);
  await pipeline(Readable.fromWeb(stream as never), createWriteStream(path));
}

class Changed extends Error {}

/** Makes of one medium what is shown. Answers the files written, or why it was refused. */
async function render(
  storage: Storage,
  row: Row,
  folder: string,
  tools: Tools,
  // Each key is added as it is written, so that a failure afterwards deletes what was written.
  written: string[],
  signal?: AbortSignal,
): Promise<{
  files: MediaFiles;
  width: number;
  height: number;
  durationMs: number | null;
  // For a report's: what the file said of where and when it was taken, and what the analysis
  // looks at.
  taken: Taken | null;
  samples: Uint8Array[];
}> {
  const held = await storage.head(row.uploadKey);
  if (!held) throw new Changed();
  if (held.bytes !== row.uploadBytes || held.bytes > MEDIA_MOST_BYTES[row.kind]) {
    throw new Changed();
  }
  if (row.uploadEtag && held.etag && held.etag !== row.uploadEtag) throw new Changed();

  const original = join(folder, "original");
  await download(storage, row, original).catch((error: unknown) => {
    // The bucket gave another file than the one that was sent.
    if (error instanceof Error && /not the file that was sent/.test(error.message)) {
      throw new Changed();
    }
    throw error;
  });

  const put = async (
    name: string,
    body: Uint8Array,
    contentType: string,
    size: { width: number; height: number },
  ) => {
    // Each try writes under its own number: the files of a try that failed, which the trash may
    // delete later, are never those of one that worked.
    const key = `m/${row.id}/${row.attempts}/${name}`;
    written.push(key);
    await storage.write(key, body, contentType);
    return { key, contentType, bytes: body.byteLength, ...size } satisfies MediaFile;
  };

  const forReport = row.purpose === "report";
  if (row.kind === "photo") {
    const bytes = await readFile(original);
    const made = await renderPhoto(bytes);
    const display = await put(
      "display.avif",
      made.display.body,
      made.display.contentType,
      made.display,
    );
    const thumb = await put("thumb.webp", made.thumb.body, made.thumb.contentType, made.thumb);
    return {
      files: { display, thumb },
      width: display.width,
      height: display.height,
      durationMs: null,
      taken: forReport ? await readPhoto(bytes) : null,
      samples: forReport ? [made.sample] : [],
    };
  }

  const made = await renderVideo(original, folder, {
    mostSeconds: VIDEO_MOST_SECONDS[row.purpose],
    // A video kept for a session keeps its sound. One shown to everyone does not: it would carry
    // what people said beside the camera.
    audio: row.purpose === "session",
    frames: forReport,
    tools,
    ...(signal && { signal }),
  });
  const video = await put("video.mp4", await readFile(made.video.path), "video/mp4", made.video);
  const poster = await put("poster.webp", made.poster.body, made.poster.contentType, made.poster);
  const thumb = await put("thumb.webp", made.thumb.body, made.thumb.contentType, made.thumb);
  return {
    files: { video, poster, thumb },
    width: video.width,
    height: video.height,
    durationMs: made.video.durationMs,
    taken: forReport ? readVideo(made.probed) : null,
    samples: made.frames,
  };
}

/**
 * Decides a report and says nothing when it cannot: what was made is kept, and the next run
 * decides the reports still being checked whose media are all done.
 */
async function settleLater(db: Database, reportId: string) {
  try {
    await settleReport(db, reportId);
  } catch (error) {
    console.error(`media: a report could not be decided (${(error as Error).name})`);
  }
}

/** Decides the reports still being checked whose media are all made or refused. */
async function settleWaiting(db: Database) {
  const waiting = await db
    .select({ id: surfReport.id })
    .from(surfReport)
    .where(
      and(
        eq(surfReport.state, "checking"),
        sql`not exists (select 1 from ${media} where ${media.reportId} = ${surfReport.id}
          and ${media.state} in ('awaiting_upload', 'uploaded'))`,
      ),
    )
    .limit(50);
  for (const report of waiting) await settleLater(db, report.id);
  return waiting.length;
}

/**
 * Deletes files the worker wrote for a medium that keeps none of them. When the bucket does not
 * answer, their keys go to the trash, which tries again: no file is left that nothing names.
 */
async function forget(db: Database, storage: Storage, keys: readonly string[]) {
  if (keys.length === 0) return;
  try {
    await storage.remove(keys);
  } catch {
    await db.insert(mediaTrash).values({ keys: [...keys] });
  }
}

/**
 * What a medium of a report comes to: where and when it was taken, from the file or else from
 * the phone, and, when both fit, what the analysis sees in it. Null for a medium of no report.
 */
async function checksOf(
  db: Database,
  row: Row,
  taken: Taken | null,
  samples: readonly Uint8Array[],
  analyser: Analyser | undefined,
): Promise<MediaChecks | null> {
  if (!row.reportId) return null;
  const [report] = await db
    .select({
      sentAt: surfReport.createdAt,
      deviceLatitude: surfReport.deviceLatitude,
      deviceLongitude: surfReport.deviceLongitude,
      deviceAccuracyM: surfReport.deviceAccuracyM,
      offsetMinutes: surfReport.offsetMinutes,
      latitude: surfBreak.latitude,
      longitude: surfBreak.longitude,
    })
    .from(surfReport)
    .innerJoin(surfBreak, eq(surfBreak.id, surfReport.breakId))
    .where(eq(surfReport.id, row.reportId));
  if (!report) return null;
  const device =
    report.deviceLatitude !== null && report.deviceLongitude !== null
      ? {
          latitude: report.deviceLatitude,
          longitude: report.deviceLongitude,
          accuracyM: report.deviceAccuracyM,
        }
      : null;
  const position = checkPosition(taken?.point ?? null, device, report);
  const time = checkTime(taken?.time ?? null, {
    at: report.sentAt,
    offsetMinutes: report.offsetMinutes,
    positionSource: position.source,
  });
  // The analysis looks only at what was taken there and lately: the rest is refused already.
  let analysis = null;
  if (!position.reason && !time.reason && analyser && samples.length > 0) {
    // A model that cannot be loaded leaves the medium to an operator.
    analysis = await analyser.analyse(samples).catch(() => null);
  }
  return judgeMedium(position, time, analysis);
}

/**
 * Decides a report once each of its media is made or refused: shown, left to an operator, or
 * refused. The phone's position is kept only where it placed a medium within the radius. A
 * report an operator or the flags already moved is not decided again.
 */
export async function settleReport(db: Database, reportId: string) {
  const rows = await db
    .select({ state: media.state, checks: media.checks })
    .from(media)
    .where(eq(media.reportId, reportId));
  if (rows.some((row) => row.state === "awaiting_upload" || row.state === "uploaded")) return null;
  const verdict = judgeReport(
    rows.map((row) => (row.state === "ready" && row.checks ? row.checks : null)),
  );
  const placed = rows.some(
    (row) => row.checks?.position.source === "device" && row.checks.position.reason === null,
  );
  // Where the phone stood is forgotten whatever became of the report, an operator's decision
  // taken before the checks ended too.
  if (!placed) {
    await db
      .update(surfReport)
      .set({ deviceLatitude: null, deviceLongitude: null, deviceAccuracyM: null })
      .where(eq(surfReport.id, reportId));
  }
  const now = new Date();
  const [settled] = await db
    .update(surfReport)
    // The moment it is first shown, which decides whether it is told: decision 068.
    .set({ state: verdict, checkedAt: now, ...(verdict === "published" && { publishedAt: now }) })
    .where(and(eq(surfReport.id, reportId), eq(surfReport.state, "checking")))
    .returning({ id: surfReport.id });
  return settled ? verdict : null;
}

/**
 * Makes of one medium what is shown, and says so in its row: only while the row is still this
 * worker's, so that one deleted or taken by another meanwhile keeps none of it.
 */
async function processOne(
  db: Database,
  storage: Storage,
  row: Row,
  claim: string,
  tools: Tools,
  analyser: Analyser | undefined,
  signal?: AbortSignal,
): Promise<"ready" | "failed" | "retried"> {
  const mine = and(eq(media.id, row.id), eq(media.claim, claim), eq(media.state, "uploaded"));
  const folder = await mkdtemp(join(tmpdir(), "tonnr-media-"));
  const written: string[] = [];
  // Whether the medium was made or refused for good, which decides its report.
  let decided = false;
  try {
    const made = await render(storage, row, folder, tools, written, signal);
    const checks = await checksOf(db, row, made.taken, made.samples, analyser);
    const [kept] = await db
      .update(media)
      .set({
        state: "ready",
        files: made.files,
        bytes: Object.values(made.files).reduce((sum, file) => sum + (file?.bytes ?? 0), 0),
        width: made.width,
        height: made.height,
        durationMs: made.durationMs,
        checks,
        readyAt: new Date(),
        claim: null,
        claimedUntil: null,
      })
      .where(mine)
      .returning({ id: media.id });
    if (!kept) {
      await forget(db, storage, written);
      return "retried";
    }
    await storage.remove([row.uploadKey]).catch(() => {});
    decided = true;
    return "ready";
  } catch (error) {
    await forget(db, storage, written);
    const refused: MediaFailure | null =
      error instanceof PhotoRefused || error instanceof VideoRefused
        ? error.reason
        : error instanceof Changed
          ? "changed"
          : row.attempts >= MOST_ATTEMPTS
            ? "gave_up"
            : null;
    if (refused === null) {
      // A run tries again in a few minutes, unless the job is being stopped, whose run ends here.
      await db
        .update(media)
        .set({ claim: null, claimedUntil: sql`now() + interval '5 minutes'` })
        .where(mine);
      if (signal?.aborted) throw error;
      return "retried";
    }
    await db
      .update(media)
      .set({ state: "failed", failure: refused, claim: null, claimedUntil: null })
      .where(mine);
    await storage.remove([row.uploadKey]).catch(() => {});
    decided = true;
    return "failed";
  } finally {
    await rm(folder, { recursive: true, force: true });
    // Decided once what was made is kept, apart from it: a report that cannot be decided now
    // loses nothing of its media.
    if (decided && row.reportId) await settleLater(db, row.reportId);
  }
}

/** Gives up on media tried as many times as they may be, and lets go of their files. */
async function giveUp(db: Database, storage: Storage) {
  const gone = await db
    .update(media)
    .set({ state: "failed", failure: "gave_up", claim: null, claimedUntil: null })
    .where(
      and(
        eq(media.state, "uploaded"),
        sql`${media.attempts} >= ${MOST_ATTEMPTS}`,
        or(isNull(media.claimedUntil), lt(media.claimedUntil, sql`now()`)),
      ),
    )
    .returning({ uploadKey: media.uploadKey, reportId: media.reportId });
  if (gone.length > 0) await storage.remove(gone.map((row) => row.uploadKey)).catch(() => {});
  for (const reportId of new Set(gone.flatMap((row) => (row.reportId ? [row.reportId] : [])))) {
    await settleLater(db, reportId);
  }
  return gone.length;
}

/**
 * Deletes what was sent and never used, a day after it was asked for: a medium that belongs to
 * nothing, and a file that never came, whatever it was given to. Their keys go to the trash, which the database writes. A medium a
 * request is giving a session at that moment is held by it, and passed over.
 */
async function abandonUnused(db: Database, now: number) {
  const before = new Date(now - UNUSED_MS);
  const gone = await db
    .delete(media)
    .where(
      inArray(
        media.id,
        sql`(select ${media.id} from ${media}
          where ${media.createdAt} < ${before}
            and ((${media.sessionId} is null and ${media.reportId} is null)
              or ${media.state} = 'awaiting_upload')
          for update skip locked)`,
      ),
    )
    .returning({ id: media.id });
  return gone.length;
}

/** Deletes the counts of what was sent once no limit reads them: two days of hours, a week of days. */
async function pruneCounts(db: Database, now: number) {
  await db.delete(mediaSentHour).where(lt(mediaSentHour.hour, new Date(now - 2 * DAY_MS)));
  await db.delete(reportSent).where(lt(reportSent.at, new Date(now - 2 * DAY_MS)));
  await db
    .delete(mediaSentDay)
    .where(lt(mediaSentDay.day, new Date(now - 7 * DAY_MS).toISOString().slice(0, 10)));
}

/**
 * Deletes the reports older than an instance keeps them, with their media, whose files go to the
 * trash. Téo's instance keeps them all for now: the setting is not set. Decision 067.
 */
async function purgeReports(db: Database, now: number, days: number) {
  const before = new Date(now - days * DAY_MS);
  const gone = await db
    .delete(surfReport)
    .where(lt(surfReport.createdAt, before))
    .returning({ id: surfReport.id });
  return gone.length;
}

/** Deletes from the bucket the keys nothing keeps, a few hundred at a time. */
async function emptyTrash(db: Database, storage: Storage) {
  const rows = await db
    .select()
    .from(mediaTrash)
    .orderBy(asc(mediaTrash.attempts), asc(mediaTrash.id))
    .limit(100);
  let trashed = 0;
  let trashFailed = 0;
  for (const row of rows) {
    if (trashed >= TRASH_AT_ONCE) break;
    try {
      await storage.remove(row.keys);
      await db.delete(mediaTrash).where(eq(mediaTrash.id, row.id));
      trashed += row.keys.length;
    } catch {
      trashFailed += 1;
      await db
        .update(mediaTrash)
        .set({ attempts: sql`${mediaTrash.attempts} + 1` })
        .where(eq(mediaTrash.id, row.id));
    }
  }
  const [left] = await db.select({ count: sql<number>`count(*)::int` }).from(mediaTrash);
  return { trashed, trashFailed, trashLeft: left?.count ?? 0 };
}

/** One run: media made one after the other for a few minutes, then what was never used and the trash. */
export async function runMedia(
  db: Database,
  storage: Storage,
  options: {
    tools?: Tools;
    analyser?: Analyser;
    // How many days a report is kept, when the instance deletes them: decision 067.
    keepReportDays?: number;
    signal?: AbortSignal;
    now?: () => number;
  } = {},
): Promise<MediaRun> {
  const now = options.now ?? Date.now;
  const tools = options.tools ?? DEFAULT_TOOLS;
  const started = now();
  const run: MediaRun = {
    ready: 0,
    failed: 0,
    retried: 0,
    abandoned: 0,
    purged: 0,
    trashed: 0,
    trashFailed: 0,
    trashLeft: 0,
  };
  run.failed += await giveUp(db, storage);
  const claim = crypto.randomUUID();
  // A medium let go to be tried again is held back by its claim until the next run.
  while (now() - started < RUN_MS && !options.signal?.aborted) {
    const row = await claimNext(db, claim);
    if (!row) break;
    run[await processOne(db, storage, row, claim, tools, options.analyser, options.signal)] += 1;
  }
  await settleWaiting(db);
  run.abandoned = await abandonUnused(db, now());
  await pruneCounts(db, now());
  if (options.keepReportDays !== undefined) {
    run.purged = await purgeReports(db, now(), options.keepReportDays);
  }
  Object.assign(run, await emptyTrash(db, storage));
  return run;
}

/** The job of the scheduler, which runs until it is stopped and is given its signal. */
export const processMedia = (
  db: Database,
  storage: Storage,
  options: { analyser?: Analyser; keepReportDays?: number; tools?: Tools } = {},
) =>
  Effect.tryPromise({
    try: (signal) => runMedia(db, storage, { signal, ...options }),
    catch: (cause) => new StoreError({ provider: "media", cause }),
  });

/** What a run says it did. */
export function mediaDone(run: MediaRun): Done {
  if (run.ready + run.failed + run.abandoned + run.purged + run.trashed > 0) {
    console.log(
      `media: ${run.ready} ready, ${run.failed} failed, ${run.retried} to try again, ${run.abandoned} never used, ${run.purged} reports past their days, ${run.trashed} files deleted (${run.trashLeft} lists left)`,
    );
  }
  return { counts: { ...run }, degraded: run.retried > 0 || run.trashFailed > 0 };
}

/**
 * Listens for the API, which says when a file waits: `wake` is then called, and the scheduler's
 * run follows within seconds. A connection that drops is opened again; the run of every minute
 * finds whatever came meanwhile.
 */
export function listenForUploads(address: string, channel: string, wake: () => void) {
  let client: pg.Client | null = null;
  let stopped = false;
  const open = async () => {
    if (stopped) return;
    const next = new pg.Client(connectionOf(address, {}));
    next.on("notification", () => wake());
    next.on("error", () => {
      next.end().catch(() => {});
      if (client === next) client = null;
      setTimeout(() => void open(), 10_000).unref();
    });
    try {
      await next.connect();
      await next.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
      client = next;
    } catch {
      next.end().catch(() => {});
      setTimeout(() => void open(), 10_000).unref();
    }
  };
  void open();
  return {
    stop: async () => {
      stopped = true;
      await client?.end().catch(() => {});
    },
  };
}
