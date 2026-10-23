import { ORPCError } from "@orpc/server";
import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { hourOf } from "@repo/conditions/forecasts/week";
import { setsFit } from "@repo/conditions/sessions/sizes";
import { hasInsult } from "@repo/config/insults";
import { REPORT_MOST_MEDIA, REPORT_NOTE_MOST, REPORT_TERMS } from "@repo/config/media";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { notBlockedBy } from "@repo/db/blocks";
import { user } from "@repo/db/schema/auth";
import { media } from "@repo/db/schema/media";
import { REPORT_STATES, reportSent, surfReport, surfReportFlag } from "@repo/db/schema/reports";
import type { SessionHour } from "@repo/db/schema/sessions";
import { SURF_SIZES } from "@repo/db/schema/sessions";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import { z } from "zod";

import { recordAction } from "../actions";
import { adminProcedure, type Caller, callerProcedure, protectedProcedure } from "../index";
import { describeMedia, storageOf, wakeWorker } from "../media";
import {
  admitReportCount,
  describeReports,
  FLAGS_HIDE,
  flagsOf,
  hasAddress,
  reasonsOf,
  reportSchema,
  shownSince,
} from "../reports";
import { hasControlCharacter } from "../text";

// What accounts show of the waves at a break as they are now: decision 067.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// How many reports an account sends in a day, and at one break in an hour.
const REPORTS_A_DAY = 10;
const REPORTS_AN_HOUR_HERE = 1;
// How many reports an account flags in a day, and how old it must be for its flag to count
// among those that hide a report. A younger one's flag, or one of an account with no username,
// is kept and comes to an operator all the same: Apple asks that anyone may flag what they read
// (guideline 1.2), and three accounts made for it must not hide a report. Decision 067.
const FLAGS_A_DAY = 20;
const FLAGGER_AGE_MS = DAY_MS;

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No report "${id}".` });
}

const sizeSchema = z.enum(SURF_SIZES);
const noteSchema = z
  .string()
  .trim()
  .max(REPORT_NOTE_MOST)
  .refine((note) => !hasControlCharacter(note), "must not contain control characters")
  // What everyone reads holds no address to go elsewhere, and no insult (guideline 1.2).
  .refine((note) => !hasAddress(note), "must not contain an address")
  .refine((note) => !hasInsult(note), "must not contain an insult");

/**
 * Adds one to a count of each report that is shown and is not the caller's. One statement for
 * each, in the order of their ids, so that two browsers that count the same reports at once
 * never wait on each other in a circle.
 */
async function countUp(
  context: { db: Database; caller: Caller },
  ids: readonly string[],
  column: "views" | "opens",
) {
  const callerId = context.caller.via === "session" ? context.caller.userId : null;
  const since = shownSince(Date.now());
  let counted = 0;
  for (const id of [...new Set(ids)].sort()) {
    const done = await context.db
      .update(surfReport)
      .set({ [column]: sql`${surfReport[column]} + 1` })
      .where(
        and(
          eq(surfReport.id, id),
          eq(surfReport.state, "published"),
          gte(surfReport.createdAt, since),
          callerId ? ne(surfReport.userId, callerId) : undefined,
        ),
      )
      .returning({ id: surfReport.id });
    counted += done.length;
  }
  return counted;
}

/** The hour of the forecast kept for a break's cell, when one is kept: nothing is asked for it. */
async function keptHour(
  forecasts: Pick<Forecasts, "kept">,
  point: { latitude: number; longitude: number },
  now: Date,
): Promise<SessionHour | null> {
  const result = await Effect.runPromise(Effect.result(forecasts.kept(point)));
  if (Result.isFailure(result)) return null;
  const hour = result.success?.hours ? hourOf(result.success.hours, now) : null;
  return hour ? { ...hour, time: hour.time.toISOString() } : null;
}

/** A report as an operator reads it: everything that was checked, and who flagged it. */
const reviewedSchema = reportSchema.extend({
  authorId: z.string(),
  breakName: z.string(),
  // Where the phone said it stood, kept only where it placed a photo near the break.
  device: z
    .object({ latitude: z.number(), longitude: z.number(), accuracyM: z.number().nullable() })
    .nullable(),
  checkedAt: z.date().nullable(),
  decidedAt: z.date().nullable(),
  flags: z.object({
    count: z.number().int(),
    // Those of accounts that had a username and were a day old, which hide a report: the others
    // come to the operator alone.
    counted: z.number().int(),
    reasons: z.array(z.string()),
  }),
  // Every medium, with what was checked of it.
  checked: z.array(
    z.object({
      id: z.string(),
      state: z.string(),
      failure: z.string().nullable(),
      checks: z.unknown().nullable(),
    }),
  ),
});

export const reportsRouter = {
  create: protectedProcedure
    .meta({ analytics: "report_sent" })
    .route({
      method: "POST",
      path: "/reports",
      successStatus: 201,
      summary: "Show the waves at a break as they are now",
      description:
        "One to four photos and videos sent beforehand with `POST /media` for `report`, with " +
        "how big the waves looked and a few words, with no address and no insult. Takes an " +
        "account that has a username, and " +
        "the version of the terms its photos are sent under. `device` is where the phone stands, " +
        "which places a photo whose file says nothing of where it was taken: an iPhone's " +
        "browser takes it out. `offsetMinutes` is the browser's own, which reads a camera's " +
        "time that says no offset. The report is shown once each photo was found taken within " +
        "2 km of the break in the last two hours, and of the sea: `state` follows. An account " +
        "sends ten a day, and one an hour at a break.",
      tags: ["Reports"],
    })
    .input(
      z
        .object({
          breakId: z.string(),
          mediaIds: z
            .array(z.string())
            .min(1)
            .max(REPORT_MOST_MEDIA)
            .refine((ids) => new Set(ids).size === ids.length, "each photo or video once"),
          waveSize: sizeSchema.optional(),
          setSize: sizeSchema.optional(),
          note: noteSchema.optional(),
          device: z
            .object({
              latitude: z.number().min(-90).max(90),
              longitude: z.number().min(-180).max(180),
              accuracyM: z.number().min(0).max(1_000_000).nullable(),
            })
            .optional(),
          offsetMinutes: z
            .number()
            .int()
            .min(-14 * 60)
            .max(14 * 60)
            .optional(),
          terms: z.literal(REPORT_TERMS),
        })
        .refine(
          (input) => setsFit(input.waveSize ?? null, input.setSize ?? null),
          "The sets are never smaller than the waves.",
        ),
    )
    .output(reportSchema)
    .handler(async ({ input, context }) => {
      storageOf(context.storage);
      const userId = context.session.user.id;
      const now = Date.now();
      const [place] = await context.db
        .select({ latitude: surfBreak.latitude, longitude: surfBreak.longitude })
        .from(surfBreak)
        .where(eq(surfBreak.id, input.breakId));
      if (!place) throw new ORPCError("NOT_FOUND", { message: `No break "${input.breakId}".` });
      // What the models said of the sea there this hour, from what is kept: nothing is asked.
      const forecast = await keptHour(context.forecasts, place, new Date(now));

      const id = crypto.randomUUID();
      const refusal = await context.db.transaction(async (tx) => {
        await holdAccounts(tx, [userId]);
        const [account] = await tx
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, userId));
        if (!account?.username) return "username" as const;
        // Counted from what was sent, which deleting a report does not give back.
        const [sent] = await tx
          .select({
            day: sql<number>`(count(*) filter (where ${reportSent.at} >= ${new Date(now - DAY_MS)}))::int`,
            here: sql<number>`(count(*) filter (where ${reportSent.at} >= ${new Date(now - HOUR_MS)} and ${reportSent.breakId} = ${input.breakId}))::int`,
          })
          .from(reportSent)
          .where(eq(reportSent.userId, userId));
        if ((sent?.day ?? 0) >= REPORTS_A_DAY) return "day" as const;
        if ((sent?.here ?? 0) >= REPORTS_AN_HOUR_HERE) return "here" as const;
        // The break is held until the report is written, so that it cannot go meanwhile.
        const [still] = await tx
          .select({ id: surfBreak.id })
          .from(surfBreak)
          .where(eq(surfBreak.id, input.breakId))
          .for("share");
        if (!still) return "gone" as const;
        // The media, in the order of their ids: each the account's own, sent for a report, in
        // the bucket, and given to none yet.
        const rows = await tx
          .select({
            id: media.id,
            purpose: media.purpose,
            state: media.state,
            reportId: media.reportId,
          })
          .from(media)
          .where(and(inArray(media.id, input.mediaIds), eq(media.userId, userId)))
          .orderBy(asc(media.id))
          .for("update");
        if (rows.length !== input.mediaIds.length) return "media" as const;
        if (
          rows.some(
            (row) => row.purpose !== "report" || row.reportId !== null || row.state !== "uploaded",
          )
        ) {
          return "taken" as const;
        }
        await tx.insert(surfReport).values({
          id,
          userId,
          breakId: input.breakId,
          waveSize: input.waveSize ?? null,
          setSize: input.setSize ?? null,
          note: input.note || null,
          deviceLatitude: input.device?.latitude ?? null,
          deviceLongitude: input.device?.longitude ?? null,
          deviceAccuracyM: input.device?.accuracyM ?? null,
          offsetMinutes: input.offsetMinutes ?? null,
          forecast,
          terms: input.terms,
          // By the API's clock, which the checks read the age of a photo against.
          createdAt: new Date(now),
        });
        for (const [position, mediaId] of input.mediaIds.entries()) {
          await tx.update(media).set({ reportId: id, position }).where(eq(media.id, mediaId));
        }
        await tx.insert(reportSent).values({ userId, breakId: input.breakId, at: new Date(now) });
        return null;
      });
      if (refusal === "username") {
        throw new ORPCError("FORBIDDEN", {
          message: "Choose a username first: a report is read under it.",
          data: { username: "missing" },
        });
      }
      if (refusal === "day" || refusal === "here") {
        context.reply.retryAfterSeconds = refusal === "day" ? 24 * 60 * 60 : 60 * 60;
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message:
            refusal === "day"
              ? `An account sends ${REPORTS_A_DAY} reports a day at most.`
              : "An account sends one report an hour at a break.",
          data: { reports: refusal },
        });
      }
      if (refusal === "gone") throw new ORPCError("NOT_FOUND", { message: "The break is gone." });
      if (refusal === "media") {
        throw new ORPCError("NOT_FOUND", { message: "A photo or a video is not there." });
      }
      if (refusal === "taken") {
        throw new ORPCError("CONFLICT", {
          message: "Each photo or video is sent for a report, in full, and goes with one only.",
        });
      }
      await wakeWorker(context.db);
      const [row] = await context.db.select().from(surfReport).where(eq(surfReport.id, id));
      if (!row) throw notFound(id);
      const [report] = await describeReports(context.db, context.storage, [row], {
        callerId: userId,
        now,
      });
      return report!;
    }),

  list: callerProcedure
    .route({
      method: "GET",
      path: "/reports",
      summary: "The reports of the last week at a break, the latest first",
      description:
        "Each is the waves at the break as an account saw them, in photos and videos found taken " +
        "there and of the sea, with how big they looked. A report is the sea of now for six " +
        "hours, and shown for a week. The caller's own come with where they stand and why one " +
        "is not shown, and those of an account it blocked are left out. Addresses of photos " +
        "are good for an hour at least.",
      tags: ["Reports"],
    })
    .input(z.object({ breakId: z.string() }))
    // `offered` is false on an instance that keeps no photos, which takes no report.
    .output(z.object({ reports: z.array(reportSchema), offered: z.boolean() }))
    .handler(async ({ input, context }) => {
      const now = Date.now();
      const callerId = context.caller.via === "session" ? context.caller.userId : null;
      const rows = await context.db
        .select()
        .from(surfReport)
        .where(
          and(
            eq(surfReport.breakId, input.breakId),
            gte(surfReport.createdAt, shownSince(now)),
            callerId
              ? or(
                  eq(surfReport.state, "published"),
                  and(eq(surfReport.userId, callerId), ne(surfReport.state, "removed")),
                )
              : eq(surfReport.state, "published"),
            // An account reads nothing of an account it blocked: decision 071.
            callerId ? notBlockedBy(callerId, surfReport.userId) : undefined,
          ),
        )
        .orderBy(desc(surfReport.createdAt), desc(surfReport.id))
        .limit(50);
      return {
        reports: await describeReports(context.db, context.storage, rows, { callerId, now }),
        offered: Boolean(context.storage),
      };
    }),

  seen: callerProcedure
    .meta({ analytics: "reports_seen" })
    .route({
      method: "POST",
      path: "/reports/seen",
      summary: "Count that a browser saw some reports",
      description:
        "What the web app says once a report has been in view a second, a report once a " +
        "browser. Each report that is shown, and is not the caller's, is counted once, and " +
        "nothing of who saw it is kept: its author reads the number. A key counts nothing, and " +
        "a caller counts 120 times an hour at most. Decision 068.",
      tags: ["Reports"],
    })
    .input(z.object({ ids: z.array(z.string().max(64)).min(1).max(20) }))
    .output(z.object({ counted: z.number().int() }))
    .handler(async ({ input, context }) => ({
      counted: (await admitReportCount(context)) ? await countUp(context, input.ids, "views") : 0,
    })),

  opened: callerProcedure
    .meta({ analytics: "report_media_opened" })
    .route({
      method: "POST",
      path: "/reports/{id}/opened",
      summary: "Count that a browser opened a photo or a video of a report",
      description:
        "Once a report and a browser, as `POST /reports/seen` counts a view, and by the same " +
        "rules. Decision 068.",
      tags: ["Reports"],
    })
    .input(z.object({ id: z.string().max(64) }))
    .output(z.object({ counted: z.number().int() }))
    .handler(async ({ input, context }) => ({
      counted: (await admitReportCount(context)) ? await countUp(context, [input.id], "opens") : 0,
    })),

  delete: protectedProcedure
    .meta({ analytics: "report_deleted" })
    .route({
      method: "DELETE",
      path: "/reports/{id}",
      summary: "Delete one of the caller's reports",
      description: "With its photos and videos, whose files go from the bucket within minutes.",
      tags: ["Reports"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(surfReport)
        .where(and(eq(surfReport.id, input.id), eq(surfReport.userId, context.session.user.id)))
        .returning({ id: surfReport.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),

  flag: protectedProcedure
    .meta({ analytics: "report_flagged" })
    .route({
      method: "POST",
      path: "/reports/{id}/flag",
      summary: "Say that a report should not be shown",
      description:
        "Once for each account, with a reason that an operator of the instance reads. Three " +
        "accounts that have a username and are a day old hide it until an operator decides: " +
        "the flag of another account comes to the operator, and hides nothing. An account " +
        `flags ${FLAGS_A_DAY} reports a day. Decision 067.`,
      tags: ["Reports"],
    })
    .input(
      z.object({
        id: z.string(),
        reason: z.enum(["not_here", "not_now", "not_sea", "offensive", "other"]),
      }),
    )
    .output(z.object({ hidden: z.boolean() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const now = Date.now();
      const refusal = await context.db.transaction(async (tx) => {
        await holdAccounts(tx, [userId]);
        const [account] = await tx
          .select({ username: user.username, createdAt: user.createdAt })
          .from(user)
          .where(eq(user.id, userId));
        // Whether this flag counts among those that hide the report, as the account is now.
        const counts =
          account !== undefined &&
          account.username !== null &&
          account.createdAt.getTime() <= now - FLAGGER_AGE_MS;
        const [flagged] = await tx
          .select({ count: count() })
          .from(surfReportFlag)
          .where(
            and(
              eq(surfReportFlag.userId, userId),
              gte(surfReportFlag.createdAt, new Date(now - DAY_MS)),
            ),
          );
        if ((flagged?.count ?? 0) >= FLAGS_A_DAY)
          return { refused: "many" as const, hidden: false };
        // The report is held while its flags are counted, so that two at once count each other.
        const [report] = await tx
          .select()
          .from(surfReport)
          .where(eq(surfReport.id, input.id))
          .for("update");
        if (!report || report.state !== "published" || report.userId === userId) {
          return { refused: "none" as const, hidden: false };
        }
        await tx
          .insert(surfReportFlag)
          .values({
            reportId: report.id,
            userId,
            reason: input.reason,
            counts,
            createdAt: new Date(now),
          })
          .onConflictDoNothing();
        if (!counts || (await flagsOf(tx, report)) < FLAGS_HIDE) {
          return { refused: null, hidden: false };
        }
        await tx.update(surfReport).set({ state: "hidden" }).where(eq(surfReport.id, report.id));
        return { refused: null, hidden: true };
      });
      if (refusal.refused === null) return { hidden: refusal.hidden };
      if (refusal.refused === "none") throw notFound(input.id);
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: `An account flags ${FLAGS_A_DAY} reports a day at most.`,
      });
    }),

  waiting: adminProcedure
    .route({
      method: "GET",
      path: "/reports/waiting",
      summary: "How many reports wait for an operator",
      description: `${ADMIN_ONLY} Those the checks left to an operator, and those the flags of accounts hid.`,
      tags: ["Reports"],
    })
    .output(z.object({ review: z.number().int(), hidden: z.number().int() }))
    .handler(async ({ context }) => {
      const [counted] = await context.db
        .select({
          review: sql<number>`(count(*) filter (where ${surfReport.state} = 'review'))::int`,
          hidden: sql<number>`(count(*) filter (where ${surfReport.state} = 'hidden'))::int`,
        })
        .from(surfReport)
        .where(inArray(surfReport.state, ["review", "hidden"]));
      return { review: counted?.review ?? 0, hidden: counted?.hidden ?? 0 };
    }),

  review: adminProcedure
    .route({
      method: "GET",
      path: "/reports/review",
      summary: "Every report, with what was checked of each photo and who flagged it",
      description:
        `${ADMIN_ONLY} The latest first, a page at a time: \`before\` and \`beforeId\` are the ` +
        "`next` of the page before. `state` keeps " +
        "one state; `flagged` keeps those that accounts flagged.",
      tags: ["Reports"],
    })
    .input(
      z.object({
        state: z.enum([...REPORT_STATES, "flagged"]).optional(),
        // The moment and the id of the last report of the page before: reports sent at the same
        // moment are told apart by their ids.
        before: z.coerce.date().optional(),
        beforeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
    )
    .output(
      z.object({
        reports: z.array(reviewedSchema),
        next: z.object({ at: z.date(), id: z.string() }).nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const now = Date.now();
      const flaggedIds =
        input.state === "flagged"
          ? (
              await context.db.selectDistinct({ id: surfReportFlag.reportId }).from(surfReportFlag)
            ).map((row) => row.id)
          : null;
      const rows = await context.db
        .select({ report: surfReport, breakName: surfBreak.name })
        .from(surfReport)
        .innerJoin(surfBreak, eq(surfBreak.id, surfReport.breakId))
        .where(
          and(
            input.state && input.state !== "flagged"
              ? eq(surfReport.state, input.state)
              : undefined,
            flaggedIds
              ? inArray(surfReport.id, flaggedIds.length > 0 ? flaggedIds : [""])
              : undefined,
            input.before
              ? or(
                  lt(surfReport.createdAt, input.before),
                  input.beforeId
                    ? and(eq(surfReport.createdAt, input.before), lt(surfReport.id, input.beforeId))
                    : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(desc(surfReport.createdAt), desc(surfReport.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const reports = page.map((row) => row.report);
      const ids = reports.map((row) => row.id);
      const [described, mediaRows, flags] = await Promise.all([
        describeReports(context.db, context.storage, reports, {
          callerId: null,
          now,
          withStats: true,
        }),
        ids.length > 0
          ? context.db
              .select()
              .from(media)
              .where(inArray(media.reportId, ids))
              .orderBy(asc(media.position))
          : Promise.resolve([]),
        ids.length > 0
          ? context.db
              .select({
                reportId: surfReportFlag.reportId,
                reason: surfReportFlag.reason,
                counts: surfReportFlag.counts,
              })
              .from(surfReportFlag)
              .where(inArray(surfReportFlag.reportId, ids))
          : Promise.resolve([]),
      ]);
      // An operator sees every medium, whatever became of it.
      const allMedia = await describeMedia(context.storage, mediaRows, now);
      return {
        reports: page.map((row, index) => {
          const mine = mediaRows.filter((one) => one.reportId === row.report.id);
          const report = described[index]!;
          return {
            ...report,
            media: allMedia.filter((_, at) => mediaRows[at]!.reportId === row.report.id),
            reasons: reasonsOf(mine),
            authorId: row.report.userId,
            breakName: row.breakName,
            device:
              row.report.deviceLatitude !== null && row.report.deviceLongitude !== null
                ? {
                    latitude: row.report.deviceLatitude,
                    longitude: row.report.deviceLongitude,
                    accuracyM: row.report.deviceAccuracyM,
                  }
                : null,
            checkedAt: row.report.checkedAt,
            decidedAt: row.report.decidedAt,
            flags: {
              count: flags.filter((flag) => flag.reportId === row.report.id).length,
              counted: flags.filter((flag) => flag.reportId === row.report.id && flag.counts)
                .length,
              reasons: flags
                .filter((flag) => flag.reportId === row.report.id)
                .flatMap((flag) => (flag.reason ? [flag.reason] : [])),
            },
            checked: mine.map((one) => ({
              id: one.id,
              state: one.state,
              failure: one.failure,
              checks: one.checks,
            })),
          };
        }),
        next:
          rows.length > input.limit && page.at(-1)
            ? { at: page.at(-1)!.report.createdAt, id: page.at(-1)!.report.id }
            : null,
      };
    }),

  decide: adminProcedure
    .route({
      method: "POST",
      path: "/reports/{id}/decision",
      summary: "Show a report, or remove it",
      description:
        `${ADMIN_ONLY} \`publish\` shows it, whatever its checks or its flags said: the flags ` +
        "before count no more. `remove` hides it from everyone but the operators, for good. " +
        "Neither deletes it.",
      tags: ["Reports"],
    })
    .input(z.object({ id: z.string(), decision: z.enum(["publish", "remove"]) }))
    .output(z.object({ state: z.enum(REPORT_STATES) }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const [report] = await tx
          .select({ id: surfReport.id, userId: surfReport.userId, state: surfReport.state })
          .from(surfReport)
          .where(eq(surfReport.id, input.id))
          .for("update");
        if (!report) throw notFound(input.id);
        const now = new Date();
        const state = input.decision === "publish" ? ("published" as const) : ("removed" as const);
        await tx
          .update(surfReport)
          .set({
            state,
            decidedAt: now,
            // The first moment it is shown stays: it says whether it is told (decision 068).
            ...(input.decision === "publish" && {
              restoredAt: now,
              publishedAt: sql`coalesce(${surfReport.publishedAt}, ${now})`,
            }),
          })
          .where(eq(surfReport.id, report.id));
        await recordAction(tx, {
          operatorId,
          action: input.decision === "publish" ? "report.publish" : "report.remove",
          developer: null,
          account: { id: report.userId },
        });
        return { state };
      });
    }),
};
