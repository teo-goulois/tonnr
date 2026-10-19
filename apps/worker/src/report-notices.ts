import { leavesAt } from "@repo/conditions/alerts/moments";
import { type AlertSettings, quietHoursOf, settingsOf } from "@repo/conditions/alerts/settings";
import { localePrefix } from "@repo/config/locales";
import type { Database } from "@repo/db";
import { notBlockedBy } from "@repo/db/blocks";
import { countCalls } from "@repo/db/calls";
import { readCatalogue } from "@repo/db/catalogue";
import { accountSuspension } from "@repo/db/schema/access";
import { alertSettings, pushSubscription } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import {
  stationList,
  stationListBreak,
  stationListMember,
  stationListSpot,
} from "@repo/db/schema/lists";
import { media } from "@repo/db/schema/media";
import { reportNotice, reportNoticeReport, surfReport } from "@repo/db/schema/reports";
import { spot, surfBreak } from "@repo/db/schema/spots";
import type { Storage } from "@repo/media/storage";
import { type ReportPushContent, reportPush } from "@repo/push/reports";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import { type PushOut, counted, kindsOf, pushToAll } from "./deliveries";
import type { Transaction } from "./kept";
import { type Done, WRITE_SECONDS } from "./runs";
import { StoreError } from "./store";

// Decision 068: a report that is shown is told to the accounts that keep its break, in a notice
// that the reports of the next three hours join, listed in the web app and pushed once.
//
// What tells a report holds, in this order: the catalogue, beside others that only read it, so
// that no merge moves a break meanwhile; the break, so that two reports at it are told one after
// the other; then the report. It holds no account: it writes rows that name accounts, which a
// flag, a suspension or a deletion does not wait for.
//
// A push leaves in two steps, as an alert's does (decision 031). The first decides what it says,
// counts it against the account's day once, and writes that it is leaving. The second holds the
// account, its settings, the notice, the reports it speaks of and the account's devices, in that
// order, which is the API's, reads again what may stop it, and hands it over: a flag, an
// operator's decision or a deletion of one of those reports waits for it, and none leaves once
// they are answered. A worker that stops between the two leaves it leaving, which is taken as
// told ten minutes later: a push is sent once at most.

const HOUR_MS = 60 * 60 * 1000;
/** A report first shown later than this after it was sent is not told: it no longer says now. */
export const TOLD_WITHIN_MS = 2 * HOUR_MS;
/** A report joins the account's notice at its break when that notice began this recently. */
export const NOTICE_SPAN_MS = 3 * HOUR_MS;
/** A push is given up when the newest report it would tell is this old. */
export const NOTICE_WORTH_MS = 3 * HOUR_MS;
/** How many notices of reports an account is pushed in a day, apart from its alerts'. */
export const ACCOUNT_DAILY_REPORT_PUSHES = 6;
/** The name an account's report pushes are counted under: `report-push:<its id>`. */
export const REPORT_PUSH_PROVIDER = "report-push";
/** How long a notice is kept. */
export const NOTICES_KEPT_DAYS = 30;
/** A report is shown a week: one older says nothing in a push, nor in the list. */
export const SHOWN_MS = 7 * 24 * HOUR_MS;
// How many reports a run tells, and how many pushes it hands over, at most.
const TOLD_AT_MOST = 100;
const SENT_AT_MOST = 60;
// A push left leaving this long was handed over by a worker that stopped: it may have left.
const LEFT_BEHIND_MS = 2 * WRITE_SECONDS * 1000;
// A push is handed over only while this much of its transaction's time is left, which is more
// than one is given: the database ends a job's transaction, and would let go of the account.
const HAND_WITHIN_MS = (WRITE_SECONDS - 60) * 1000;
// How many ids a statement names at most.
const CHUNK = 500;

/**
 * The accounts told of a report at a break: those that keep it in a list of their own or in a
 * list shared with them that they kept, with that list's switch on, or as the break of one of
 * their own spots, or of a spot of the owner's in a list shared with them; whose own switch is
 * on, who are not away, and not suspended. Never its author, nor an account that blocked its
 * author (decision 071). With `only`, that account or none.
 */
async function keepersOf(
  tx: Transaction,
  report: { breakId: string; userId: string },
  now: Date,
  only?: string,
) {
  const breakId = report.breakId;
  const holders = union(
    tx
      .select({ userId: stationList.userId })
      .from(stationListBreak)
      .innerJoin(stationList, eq(stationList.id, stationListBreak.listId))
      .where(and(eq(stationListBreak.breakId, breakId), eq(stationList.reportsOn, true))),
    tx
      .select({ userId: stationListMember.userId })
      .from(stationListBreak)
      .innerJoin(stationListMember, eq(stationListMember.listId, stationListBreak.listId))
      .where(and(eq(stationListBreak.breakId, breakId), eq(stationListMember.reportsOn, true))),
    tx.select({ userId: spot.userId }).from(spot).where(eq(spot.breakId, breakId)),
    tx
      .select({ userId: stationListMember.userId })
      .from(stationListSpot)
      .innerJoin(spot, eq(spot.id, stationListSpot.spotId))
      .innerJoin(stationListMember, eq(stationListMember.listId, stationListSpot.listId))
      .where(and(eq(spot.breakId, breakId), eq(stationListMember.reportsOn, true))),
  ).as("holders");
  const rows = await tx
    .select({ userId: holders.userId })
    .from(holders)
    .leftJoin(alertSettings, eq(alertSettings.userId, holders.userId))
    .where(
      and(
        ne(holders.userId, report.userId),
        notBlockedBy(holders.userId, report.userId),
        only === undefined ? undefined : eq(holders.userId, only),
        or(isNull(alertSettings.onReports), eq(alertSettings.onReports, true)),
        or(isNull(alertSettings.awayUntil), lte(alertSettings.awayUntil, now)),
        not(
          exists(
            tx
              .select({ one: sql`1` })
              .from(accountSuspension)
              .where(eq(accountSuspension.userId, holders.userId)),
          ),
        ),
      ),
    )
    .orderBy(asc(holders.userId));
  return rows.map((row) => row.userId);
}

const chunks = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK),
  );

/**
 * Whether a report is told: once it was first shown within two hours of being sent, and while
 * it is less than three hours old. One shown before this version says no moment, and is not.
 */
export function isWorthTelling(report: { createdAt: Date; publishedAt: Date | null }, now: Date) {
  if (!report.publishedAt) return false;
  const sent = report.createdAt.getTime();
  return (
    report.publishedAt.getTime() - sent <= TOLD_WITHIN_MS && now.getTime() - sent < NOTICE_WORTH_MS
  );
}

/**
 * Tells one report that was shown, once: it joins the notice each keeper of its break has there
 * from the last three hours, or begins one. Says how many accounts it was told to. All of it is
 * one transaction: a worker that stops tells none of it, and the next run tells it whole.
 */
async function announce(db: Database, reportId: string, kinds: readonly PushKind[]) {
  return db.transaction(async (tx) => {
    await readCatalogue(tx);
    const [found] = await tx
      .select({ breakId: surfReport.breakId })
      .from(surfReport)
      .where(eq(surfReport.id, reportId));
    if (!found) return 0;
    // Two reports at a break are told one after the other, so that each finds the notice the
    // other began.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`report-notices:${found.breakId}`}, 0))`,
    );
    const now = new Date();
    // Told once, whatever becomes of it: the first to mark it tells it.
    const [report] = await tx
      .update(surfReport)
      .set({ announcedAt: now })
      .where(
        and(
          eq(surfReport.id, reportId),
          eq(surfReport.state, "published"),
          isNull(surfReport.announcedAt),
        ),
      )
      .returning({
        breakId: surfReport.breakId,
        userId: surfReport.userId,
        createdAt: surfReport.createdAt,
        publishedAt: surfReport.publishedAt,
      });
    if (!report || !isWorthTelling(report, now)) return 0;

    const keepers = await keepersOf(tx, report, now);
    const expiresAt = new Date(report.createdAt.getTime() + NOTICE_WORTH_MS);
    const since = new Date(now.getTime() - NOTICE_SPAN_MS);
    for (const part of chunks(keepers)) {
      // The notice each of them has at the break from the last three hours, the newest.
      const open = await tx
        .selectDistinctOn([reportNotice.userId], {
          id: reportNotice.id,
          userId: reportNotice.userId,
        })
        .from(reportNotice)
        .where(
          and(
            inArray(reportNotice.userId, part),
            eq(reportNotice.breakId, report.breakId),
            gt(reportNotice.createdAt, since),
          ),
        )
        .orderBy(reportNotice.userId, desc(reportNotice.createdAt));
      if (open.length > 0) {
        const ids = open.map((one) => one.id);
        // Unread again, and a push that waits says it too, as long as it is worth saying.
        await tx
          .update(reportNotice)
          .set({
            updatedAt: now,
            readAt: null,
            told: sql`${reportNotice.told} + 1`,
            expiresAt: sql`case when ${reportNotice.pushState} in ('pending', 'sending')
              then greatest(${reportNotice.expiresAt}, ${expiresAt}) else ${reportNotice.expiresAt} end`,
          })
          .where(inArray(reportNotice.id, ids));
        await tx
          .insert(reportNoticeReport)
          .values(ids.map((noticeId) => ({ noticeId, reportId })))
          .onConflictDoNothing();
      }
      const joined = new Set(open.map((one) => one.userId));
      const fresh = part.filter((userId) => !joined.has(userId));
      if (fresh.length === 0) continue;
      // Who can be pushed to, on a device this worker reaches, and when: at once, or at the end
      // of their quiet hours.
      const [settingsRows, devices] = await Promise.all([
        tx.select().from(alertSettings).where(inArray(alertSettings.userId, fresh)),
        kinds.length > 0
          ? tx
              .selectDistinct({ userId: pushSubscription.userId })
              .from(pushSubscription)
              .where(
                and(
                  inArray(pushSubscription.userId, fresh),
                  inArray(pushSubscription.kind, [...kinds]),
                ),
              )
          : Promise.resolve([]),
      ]);
      const pushed = new Set(devices.map((one) => one.userId));
      const made = fresh.map((userId) => {
        const settings = settingsOf(settingsRows.find((row) => row.userId === userId));
        return {
          id: crypto.randomUUID(),
          userId,
          breakId: report.breakId,
          createdAt: now,
          updatedAt: now,
          ...(pushed.has(userId) && {
            pushState: "pending" as const,
            dueAt: leavesAt(now, quietHoursOf(settings)),
            expiresAt,
          }),
        };
      });
      await tx.insert(reportNotice).values(made);
      await tx
        .insert(reportNoticeReport)
        .values(made.map((one) => ({ noticeId: one.id, reportId })));
    }
    await tx.update(surfReport).set({ told: keepers.length }).where(eq(surfReport.id, reportId));
    return keepers.length;
  });
}

type PushKind = (typeof pushSubscription.$inferSelect)["kind"];

/**
 * Tells the reports shown since the last run, the oldest first. A notice is pushed to an account
 * that has a device of one of `kinds`, those the worker reaches.
 */
export async function announceReports(db: Database, kinds: readonly PushKind[]) {
  const waiting = await db
    .select({ id: surfReport.id })
    .from(surfReport)
    .where(and(eq(surfReport.state, "published"), isNull(surfReport.announcedAt)))
    .orderBy(asc(surfReport.createdAt), asc(surfReport.id))
    .limit(TOLD_AT_MOST);
  let accounts = 0;
  for (const { id } of waiting) accounts += await announce(db, id, kinds);
  return { reports: waiting.length, accounts };
}

type Outcome = "sent" | "failed" | "held" | "expired" | "skipped";
type Taken = {
  userId: string;
  // What the push says but its picture, which is signed as it is handed over.
  content: Omit<ReportPushContent, "image">;
  // The break and the reports it was written from: another break, as a merge makes, or another
  // set of reports when it is handed over, and it is written anew.
  stamp: string;
};

/** What a push is written from: its break and the reports still shown there, newest first. */
const stampOf = (breakId: string, shown: readonly { id: string }[]) =>
  [breakId, ...shown.map((one) => one.id)].join(",");

/**
 * Until when a push is worth keeping: three hours after the newest report it tells that is still
 * shown, whatever the reports that joined it and went since gave it before.
 */
const worthUntil = (newest: { createdAt: Date }) =>
  new Date(newest.createdAt.getTime() + NOTICE_WORTH_MS);

/**
 * Holds what a push depends on, in the order the API takes it: the account, so that a
 * suspension or its deletion waits, then its settings, so that switching reports off waits,
 * then the notice.
 */
async function hold(tx: Transaction, noticeId: string) {
  const [head] = await tx
    .select({ userId: reportNotice.userId })
    .from(reportNotice)
    .where(eq(reportNotice.id, noticeId));
  if (!head) return null;
  const [account] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, head.userId))
    .for("share");
  // An account that set nothing has no row to hold, and its first change would not wait: it
  // gets one, with the defaults it reads already.
  if (account) {
    await tx.insert(alertSettings).values({ userId: head.userId }).onConflictDoNothing();
  }
  const [settingsRow] = await tx
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.userId, head.userId))
    .for("update");
  const [notice] = await tx
    .select()
    .from(reportNotice)
    .where(eq(reportNotice.id, noticeId))
    .for("update");
  if (!account || !notice) return null;
  const [suspended] = await tx
    .select({ userId: accountSuspension.userId })
    .from(accountSuspension)
    .where(eq(accountSuspension.userId, head.userId));
  return { notice, settings: settingsOf(settingsRow), suspended: suspended !== undefined };
}

/** Whether what an account chose stops a push at this moment. */
function isStopped(held: { suspended: boolean; settings: AlertSettings }, now: Date) {
  const { settings } = held;
  const isAway = settings.awayUntil !== null && settings.awayUntil.getTime() > now.getTime();
  return held.suspended || !settings.onReports || isAway;
}

/**
 * The reports of a notice that are still shown, the newest first, but those of an account that
 * the notice's owner blocked since they joined it: a push says nothing of them (decision 071).
 * `lock` holds them until the transaction ends, so that a flag, an operator or their author
 * waits for the push.
 */
async function shownOf(
  tx: Transaction,
  notice: { id: string; userId: string },
  now: Date,
  lock = false,
) {
  const query = tx
    .select({
      id: surfReport.id,
      userId: surfReport.userId,
      waveSize: surfReport.waveSize,
      note: surfReport.note,
      createdAt: surfReport.createdAt,
    })
    .from(reportNoticeReport)
    .innerJoin(surfReport, eq(surfReport.id, reportNoticeReport.reportId))
    .where(
      and(
        eq(reportNoticeReport.noticeId, notice.id),
        eq(surfReport.state, "published"),
        gt(surfReport.createdAt, new Date(now.getTime() - SHOWN_MS)),
        notBlockedBy(notice.userId, surfReport.userId),
      ),
    )
    .orderBy(desc(surfReport.createdAt), desc(surfReport.id));
  return lock ? query.for("share", { of: surfReport }) : query;
}

/** The address of a report's first photo, signed for as long as its push is kept, and an hour. */
async function imageOf(tx: Transaction, storage: Storage | null, reportId: string, until: Date) {
  if (!storage) return null;
  const [first] = await tx
    .select({ files: media.files })
    .from(media)
    .where(and(eq(media.reportId, reportId), eq(media.state, "ready")))
    .orderBy(asc(media.position), asc(media.createdAt))
    .limit(1);
  const thumb = first?.files.thumb;
  if (!thumb) return null;
  const now = new Date();
  const seconds = Math.ceil((until.getTime() - now.getTime() + HOUR_MS) / 1000);
  return storage.readUrl(thumb.key, now, seconds);
}

/**
 * The first step: decides what the push of a notice says, counts it once, and writes that it is
 * leaving. One that cannot leave is settled, or put off to the end of the quiet hours.
 */
async function take(db: Database, out: PushOut, noticeId: string): Promise<Taken | Outcome> {
  return db.transaction(async (tx) => {
    const held = await hold(tx, noticeId);
    if (!held || held.notice.pushState !== "pending") return "skipped";
    const { notice, settings } = held;
    const now = new Date();
    const pending = and(eq(reportNotice.id, noticeId), eq(reportNotice.pushState, "pending"));
    const settle = async (state: "expired" | "held") => {
      await tx.update(reportNotice).set({ pushState: state, settledAt: now }).where(pending);
      return state;
    };
    if (isStopped(held, now)) return settle("expired");
    // The quiet hours as they are now: it waits for their end, and is read again then.
    const leaves = leavesAt(now, quietHoursOf(settings));
    if (leaves.getTime() > now.getTime()) {
      await tx.update(reportNotice).set({ dueAt: leaves }).where(pending);
      return "skipped";
    }
    // Written from the reports still shown, to an account that still keeps the break.
    const shown = await shownOf(tx, notice, now);
    const [newest] = shown;
    if (!newest || worthUntil(newest).getTime() <= now.getTime()) return settle("expired");
    const keeps = await keepersOf(
      tx,
      { breakId: notice.breakId, userId: newest.userId },
      now,
      notice.userId,
    );
    if (keeps.length === 0) return settle("expired");

    // Counted once, with the claim, against the account's day: a push written anew is not
    // counted again, and one that left stays counted whatever becomes of the worker.
    if (!notice.countedAt) {
      const full = await countCalls(tx, [
        {
          provider: `${REPORT_PUSH_PROVIDER}:${notice.userId}`,
          bucket: "day",
          span: "day",
          limit: ACCOUNT_DAILY_REPORT_PUSHES,
        },
      ]);
      if (full) return settle("held");
    }

    const [[place], [author]] = await Promise.all([
      tx.select({ name: surfBreak.name }).from(surfBreak).where(eq(surfBreak.id, notice.breakId)),
      tx.select({ username: user.username }).from(user).where(eq(user.id, newest.userId)),
    ]);
    const locale = settings.locale ?? "en";
    await tx
      .update(reportNotice)
      .set({ pushState: "sending", claimedAt: now, countedAt: notice.countedAt ?? now })
      .where(pending);
    return {
      userId: notice.userId,
      content: {
        locale,
        noticeId,
        breakId: notice.breakId,
        breakName: place?.name ?? "",
        count: shown.length,
        author: author?.username ?? null,
        waveSize: newest.waveSize,
        note: newest.note,
        page: `${out.webOrigin}${localePrefix(locale)}`,
      },
      stamp: stampOf(notice.breakId, shown),
    };
  });
}

/**
 * The second step: holds the account, its settings, the notice, its reports and the account's
 * devices, reads again what may have stopped the push, and hands it to every device it reaches
 * at once, each by its kind's way out.
 */
async function hand(
  db: Database,
  out: PushOut,
  storage: Storage | null,
  noticeId: string,
  taken: Taken,
) {
  const began = Date.now();
  return db.transaction(async (tx): Promise<Outcome> => {
    const held = await hold(tx, noticeId);
    // Taken as told meanwhile, by a run that found it left behind.
    if (!held || held.notice.pushState !== "sending") return "skipped";
    const now = new Date();
    const shown = await shownOf(tx, held.notice, now, true);
    // The devices of the account, of every kind, held last, as the API holds them, until the
    // push has left. Those of a kind this worker does not reach are passed over.
    const reached = kindsOf(out);
    const devices = (
      await tx
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, taken.userId))
        .orderBy(asc(pushSubscription.id))
        .for("update")
    ).filter((device) => reached.includes(device.kind));
    const sending = and(eq(reportNotice.id, noticeId), eq(reportNotice.pushState, "sending"));
    const settle = async (state: Exclude<Outcome, "skipped" | "held">) => {
      await tx.update(reportNotice).set({ pushState: state, settledAt: now }).where(sending);
      return state;
    };
    // Nothing was handed over, and nothing was told: it is read again at the next run, worth
    // as long as the newest report it now holds.
    const putBack = async (dueAt: Date, expiresAt: Date) => {
      await tx
        .update(reportNotice)
        .set({ pushState: "pending", claimedAt: null, dueAt, expiresAt })
        .where(sending);
      return "skipped" as const;
    };
    const [newest] = shown;
    if (isStopped(held, now) || devices.length === 0 || !newest) return settle("expired");
    const keepUntil = worthUntil(newest);
    if (keepUntil.getTime() <= now.getTime()) return settle("expired");
    const keeps = await keepersOf(
      tx,
      { breakId: held.notice.breakId, userId: newest.userId },
      now,
      held.notice.userId,
    );
    if (keeps.length === 0) return settle("expired");
    // A report that went or came meanwhile, or a hold that came too late to last as long as a
    // push may take: it is written anew.
    const stamp = stampOf(held.notice.breakId, shown);
    if (stamp !== taken.stamp || Date.now() - began > HAND_WITHIN_MS) {
      return putBack(now, keepUntil);
    }
    // The quiet hours may have begun since it was written: it waits for their end.
    const leaves = leavesAt(now, quietHoursOf(held.settings));
    if (leaves.getTime() > now.getTime()) return putBack(leaves, keepUntil);

    const push = reportPush({
      ...taken.content,
      image: await imageOf(tx, storage, newest.id, keepUntil),
    });
    const keepSeconds = Math.max(60, (keepUntil.getTime() - now.getTime()) / 1000);
    // To every device at once: all of them have answered before anything else happens.
    // With what the account has not read, for an app's icon, this notice among it.
    const results = await pushToAll(
      out,
      devices,
      await counted(tx, taken.userId, devices, push),
      keepSeconds,
    );
    const answers = results.map((one) => one.outcome);
    // A device whose service says that its subscription or its token is no more is forgotten.
    const gone = results.filter((one) => one.outcome === "gone").map((one) => one.device);
    if (gone.length > 0) {
      await tx.delete(pushSubscription).where(
        inArray(
          pushSubscription.id,
          gone.map((device) => device.id),
        ),
      );
    }
    // Every device is gone: nothing was told.
    if (gone.length === results.length) return settle("expired");
    // A service that took it, or that did not answer and may have: told. Every one said no: it
    // did not leave, and is not tried again.
    if (answers.includes("taken") || answers.includes("failed")) return settle("sent");
    return settle("failed");
  });
}

/** The two steps of a push, for a test that changes something between them. */
export const takeNoticePush = take;
export const handNoticePush = hand;

/** Sends one push that is due, or settles it, and says what became of it. */
async function sendOne(db: Database, out: PushOut, storage: Storage | null, noticeId: string) {
  const taken = await take(db, out, noticeId);
  if (typeof taken === "string") return taken;
  return hand(db, out, storage, noticeId, taken);
}

export type ReportNoticesRun = {
  reports: number;
  accounts: number;
  sent: number;
  failed: number;
  held: number;
  expired: number;
  pruned: number;
};

/**
 * Tells what was shown since, then hands over the pushes that are due, the oldest first, and
 * forgets the notices of more than thirty days. The log holds counts: no account, no break.
 */
export async function runReportNotices(
  db: Database,
  ways: { push: PushOut | null; storage: Storage | null },
): Promise<ReportNoticesRun> {
  const run: ReportNoticesRun = {
    ...(await announceReports(db, ways.push ? kindsOf(ways.push) : [])),
    sent: 0,
    failed: 0,
    held: 0,
    expired: 0,
    pruned: 0,
  };
  const now = new Date();
  // What waited past its hour, or that no way out will send.
  const late = await db
    .update(reportNotice)
    .set({ pushState: "expired", settledAt: now })
    .where(
      and(
        eq(reportNotice.pushState, "pending"),
        ways.push ? lte(reportNotice.expiresAt, now) : undefined,
      ),
    )
    .returning({ id: reportNotice.id });
  run.expired += late.length;
  // Left leaving by a worker that stopped: it may have left.
  await db
    .update(reportNotice)
    .set({ pushState: "sent", settledAt: now })
    .where(
      and(
        eq(reportNotice.pushState, "sending"),
        lt(reportNotice.claimedAt, new Date(now.getTime() - LEFT_BEHIND_MS)),
      ),
    );

  const out = ways.push;
  if (out) {
    const due = await db
      .select({ id: reportNotice.id })
      .from(reportNotice)
      .where(and(eq(reportNotice.pushState, "pending"), lte(reportNotice.dueAt, now)))
      .orderBy(asc(reportNotice.dueAt), asc(reportNotice.createdAt), asc(reportNotice.id))
      .limit(SENT_AT_MOST);
    for (const { id } of due) {
      try {
        const outcome = await sendOne(db, out, ways.storage, id);
        if (outcome !== "skipped") run[outcome] += 1;
      } catch (error) {
        run.failed += 1;
        console.error(`reports: a push could not be decided (${(error as Error).name})`);
      }
    }
  }

  const pruned = await db
    .delete(reportNotice)
    .where(lt(reportNotice.createdAt, new Date(now.getTime() - NOTICES_KEPT_DAYS * 24 * HOUR_MS)))
    .returning({ id: reportNotice.id });
  run.pruned = pruned.length;
  return run;
}

/** The job of the scheduler. */
export const tellReports = (
  db: Database,
  ways: { push: PushOut | null; storage: Storage | null },
) =>
  Effect.tryPromise({
    try: () => runReportNotices(db, ways),
    catch: (cause) => new StoreError({ provider: "reports", cause }),
  });

/** What a run says it did. */
export function reportNoticesDone(run: ReportNoticesRun): Done {
  if (run.reports + run.sent + run.failed + run.held + run.expired + run.pruned > 0) {
    console.log(
      `reports: ${run.reports} told to ${run.accounts} accounts, ${run.sent} pushed, ${run.held} held, ${run.expired} given up, ${run.failed} failed, ${run.pruned} notices forgotten`,
    );
  }
  return { counts: { ...run }, degraded: run.failed > 0 };
}
