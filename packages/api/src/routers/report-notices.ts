import { ORPCError } from "@orpc/server";
import { blockedBy, notBlockedBy } from "@repo/db/blocks";
import { user } from "@repo/db/schema/auth";
import { media } from "@repo/db/schema/media";
import { reportNotice, reportNoticeReport, surfReport } from "@repo/db/schema/reports";
import { SURF_SIZES } from "@repo/db/schema/sessions";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { describeMedia } from "../media";
import { shownSince } from "../reports";

// What an account was told of the reports at the breaks it keeps: decision 068. Apart from what
// its alerts told, which `notifications` answers and an assistant reads.

const noticeSchema = z.object({
  id: z.string(),
  breakId: z.string(),
  breakName: z.string(),
  // When it began, and when the last report joined it.
  createdAt: z.date(),
  updatedAt: z.date(),
  // Null until the caller read it, and again when a report joins it.
  readAt: z.date().nullable(),
  // How many reports it told, and how many of them are still shown.
  told: z.number().int(),
  shown: z.number().int(),
  // "shown" while one of its reports is; "past" once they are older than a week, which nobody
  // reads any more; "removed" when they were hidden, removed or deleted.
  state: z.enum(["shown", "past", "removed"]),
  // The newest of its reports that is shown: who sent it, how big the waves looked, its words
  // and its first photo's thumbnail, an address good for an hour at least. Null when none is.
  latest: z
    .object({
      reportId: z.string(),
      author: z.string().nullable(),
      waveSize: z.enum(SURF_SIZES).nullable(),
      note: z.string().nullable(),
      thumb: z.string().nullable(),
    })
    .nullable(),
});

export const reportNoticesRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/report-notices",
      summary: "What the caller was told of the reports at the breaks it keeps, newest first",
      description:
        "A notice is a break and the reports shown there in three hours, which the caller was " +
        "told of as it keeps the break in a list or as the break of one of its spots, the one " +
        "a report joined last first. `unread` counts those not read, on every page. A page " +
        "that has more after it says where the next begins in `next`, which `before` and " +
        "`beforeId` take. Reading here marks nothing as read. The reports of an account the " +
        "caller blocked are neither counted nor named, and a notice that told only those is " +
        "left out: decision 071.",
      tags: ["Notifications"],
    })
    .input(
      z.object({
        unreadOnly: z.union([z.boolean(), z.stringbool()]).default(false),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        // When the last notice of the page before was joined, and its id: notices joined at the
        // same moment are told apart by their ids.
        before: z.coerce.date().optional(),
        beforeId: z.string().max(64).optional(),
      }),
    )
    .output(
      z.object({
        notices: z.array(noticeSchema),
        unread: z.number().int(),
        next: z.object({ at: z.date(), id: z.string() }).nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const now = Date.now();
      // A notice says nothing of the reports of an account the caller blocked, and one that told
      // only those is left out: decision 071. It told others when it told more reports than it
      // still holds of the blocked accounts, since a report that was deleted leaves its count and
      // not its row: a notice whose reports were taken down stays, and says so.
      const blocks = await blockedBy(context.db, userId);
      const toldOthers =
        blocks.size === 0
          ? undefined
          : gt(
              reportNotice.told,
              sql`(${context.db
                .select({ total: count() })
                .from(reportNoticeReport)
                .innerJoin(surfReport, eq(surfReport.id, reportNoticeReport.reportId))
                .where(
                  and(
                    eq(reportNoticeReport.noticeId, reportNotice.id),
                    inArray(surfReport.userId, [...blocks]),
                  ),
                )})`,
            );
      const [rows, [unread]] = await Promise.all([
        context.db
          .select({ notice: reportNotice, breakName: surfBreak.name })
          .from(reportNotice)
          .innerJoin(surfBreak, eq(surfBreak.id, reportNotice.breakId))
          .where(
            and(
              eq(reportNotice.userId, userId),
              toldOthers,
              input.unreadOnly ? isNull(reportNotice.readAt) : undefined,
              input.before
                ? or(
                    lt(reportNotice.updatedAt, input.before),
                    input.beforeId
                      ? and(
                          eq(reportNotice.updatedAt, input.before),
                          lt(reportNotice.id, input.beforeId),
                        )
                      : undefined,
                  )
                : undefined,
            ),
          )
          .orderBy(desc(reportNotice.updatedAt), desc(reportNotice.id))
          .limit(input.limit + 1),
        context.db
          .select({ total: count() })
          .from(reportNotice)
          .where(and(eq(reportNotice.userId, userId), isNull(reportNotice.readAt), toldOthers)),
      ]);
      const more = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page.at(-1)?.notice;
      const ids = page.map((row) => row.notice.id);
      const told =
        ids.length === 0
          ? []
          : await context.db
              .select({
                noticeId: reportNoticeReport.noticeId,
                id: surfReport.id,
                userId: surfReport.userId,
                state: surfReport.state,
                createdAt: surfReport.createdAt,
                waveSize: surfReport.waveSize,
                note: surfReport.note,
              })
              .from(reportNoticeReport)
              .innerJoin(surfReport, eq(surfReport.id, reportNoticeReport.reportId))
              .where(
                and(
                  inArray(reportNoticeReport.noticeId, ids),
                  blocks.size === 0 ? undefined : notBlockedBy(userId, surfReport.userId),
                ),
              )
              .orderBy(desc(surfReport.createdAt), desc(surfReport.id));
      const since = shownSince(now).getTime();
      const isShown = (one: (typeof told)[number]) =>
        one.state === "published" && one.createdAt.getTime() >= since;
      const latestOf = new Map(
        ids.map((id) => [id, told.find((one) => one.noticeId === id && isShown(one))]),
      );
      const latest = [...latestOf.values()].filter((one) => one !== undefined);
      const [authors, photos] = await Promise.all([
        latest.length === 0
          ? []
          : context.db
              .select({ id: user.id, username: user.username })
              .from(user)
              .where(inArray(user.id, [...new Set(latest.map((one) => one.userId))])),
        latest.length === 0
          ? []
          : context.db
              .select()
              .from(media)
              .where(
                and(
                  inArray(
                    media.reportId,
                    latest.map((one) => one.id),
                  ),
                  eq(media.state, "ready"),
                ),
              )
              .orderBy(asc(media.position), asc(media.createdAt)),
      ]);
      // The first photo of each, described as a report's photos are.
      const firsts = latest.flatMap((one) => {
        const first = photos.find((photo) => photo.reportId === one.id);
        return first ? [first] : [];
      });
      const described = await describeMedia(context.storage, firsts, now);
      // How many of the reports each told were of an account the caller blocked since: they
      // are not counted either.
      const hidden =
        blocks.size === 0 || ids.length === 0
          ? []
          : await context.db
              .select({ noticeId: reportNoticeReport.noticeId, total: count() })
              .from(reportNoticeReport)
              .innerJoin(surfReport, eq(surfReport.id, reportNoticeReport.reportId))
              .where(
                and(
                  inArray(reportNoticeReport.noticeId, ids),
                  inArray(surfReport.userId, [...blocks]),
                ),
              )
              .groupBy(reportNoticeReport.noticeId);

      return {
        unread: unread?.total ?? 0,
        next: more && last ? { at: last.updatedAt, id: last.id } : null,
        notices: page.map(({ notice, breakName }) => {
          const mine = told.filter((one) => one.noticeId === notice.id);
          const shown = mine.filter(isShown).length;
          const newest = latestOf.get(notice.id);
          const thumb = newest
            ? (described[firsts.findIndex((one) => one.reportId === newest.id)]?.thumb ?? null)
            : null;
          return {
            id: notice.id,
            breakId: notice.breakId,
            breakName,
            createdAt: notice.createdAt,
            updatedAt: notice.updatedAt,
            readAt: notice.readAt,
            told: Math.max(
              0,
              notice.told - (hidden.find((one) => one.noticeId === notice.id)?.total ?? 0),
            ),
            shown,
            state:
              shown > 0
                ? ("shown" as const)
                : mine.some((one) => one.state === "published")
                  ? ("past" as const)
                  : ("removed" as const),
            latest: newest
              ? {
                  reportId: newest.id,
                  author: authors.find((one) => one.id === newest.userId)?.username ?? null,
                  waveSize: newest.waveSize,
                  note: newest.note,
                  thumb,
                }
              : null,
          };
        }),
      };
    }),

  markRead: protectedProcedure
    .meta({ analytics: "report_notice_read" })
    .route({
      method: "POST",
      path: "/report-notices/{id}/read",
      summary: "Mark one of the caller's notices of reports as read",
      description:
        "What the web app says once the caller opened the break's reports from the notice, in " +
        "the list or from its push: it reads every report there. The first reading keeps its time.",
      tags: ["Notifications"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string(), readAt: z.date() }))
    .handler(async ({ input, context }) => {
      const owned = and(
        eq(reportNotice.id, input.id),
        eq(reportNotice.userId, context.session.user.id),
      );
      await context.db
        .update(reportNotice)
        .set({ readAt: new Date() })
        .where(and(owned, isNull(reportNotice.readAt)));
      const [row] = await context.db
        .select({ id: reportNotice.id, readAt: reportNotice.readAt })
        .from(reportNotice)
        .where(owned);
      if (!row?.readAt) throw new ORPCError("NOT_FOUND", { message: `No notice "${input.id}".` });
      return { id: row.id, readAt: row.readAt };
    }),
};
