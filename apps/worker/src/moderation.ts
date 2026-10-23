import { CONTACT_EMAIL } from "@repo/config/app";
import type { Locale } from "@repo/config/locales";
import type { Database } from "@repo/db";
import { countCalls } from "@repo/db/calls";
import { operator } from "@repo/db/schema/access";
import { alertSettings } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { breakContribution, contributionVerdict } from "@repo/db/schema/community";
import { surfReport, surfReportFlag } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { type MailSettings, type Mailer, createMailer } from "@repo/mail";
import { type FlaggedReport, type ContestedLine, moderationMail } from "@repo/mail/moderation";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Effect } from "effect";

import type { Done } from "./runs";
import { StoreError } from "./store";

// Decision 067: what accounts flagged of the reports and contested of the guides is mailed to
// the instance's operators, who act on it in the admin, so that they read it within the hour, as
// Apple asks of an app whose accounts write that it acts on what is reported within a day. One
// mail in an hour of the clock at most, and none when nothing is new, counted apart from the
// instance's mails of the day, which accounts that sign up may spend. A flag or a contest is
// marked told once the mail that names it was taken: one that came meanwhile, or that a mail
// left for the next, is named by the next one. The mail names nothing of the account that
// flagged but whether its flag counts.

/**
 * The name a round of the mail is counted under, and nowhere else: one round in an hour of the
 * clock, so twenty-four mails a day at most to each reader, outside the instance's day of mails
 * (`MAIL_PROVIDER`), which made-up sign-ups may spend whole and would then hold back until
 * midnight what tells of an abuse.
 */
export const MODERATION_MAIL_PROVIDER = "moderation-mail";
// How many flags, and how many contests, a mail names at most: the others wait for the next.
const NAMED_AT_MOST = 100;

/** What the worker sends the mail with, and the admin's address, which the mail links to. */
export type ModerationOut = { mailer: Mailer; adminOrigin: string | null };

/**
 * What an instance's settings let the worker mail its address with: its way out of mail, and
 * the admin's address when it has an admin app. Null without a way out: the admin's moderation
 * is then the one place that says what waits.
 */
export function moderationOutOf(
  settings: MailSettings & { ADMIN_ORIGIN?: string | undefined },
): ModerationOut | null {
  const mailer = createMailer(settings);
  if (!mailer) return null;
  return {
    mailer,
    adminOrigin: settings.ADMIN_ORIGIN ? new URL(settings.ADMIN_ORIGIN).origin : null,
  };
}

/**
 * What a run did: what it named, whether it waited for its hour, and how many of its mails, one
 * to each reader, the provider took and did not take.
 */
export type ModerationRun = {
  flags: number;
  contests: number;
  mailed: number;
  held: number;
  failed: number;
};

/** Who a mail goes to, and the language it is written in. */
type Reader = { to: string; locale: Locale };

/**
 * Who reads the mail: each operator of the instance at their checked address, in the language
 * they chose for their alerts, as every mail to an account takes it, English otherwise. The
 * instance's address, `CONTACT_EMAIL`, only when no operator has a checked address, in the
 * language of the first operator who chose one: an instance run from a clone that left that
 * address as it came would otherwise mail what its accounts wrote to whoever makes the product.
 */
async function readersOf(db: Database): Promise<Reader[]> {
  const operators = await db
    .select({ to: user.email, checked: user.emailVerified, locale: alertSettings.locale })
    .from(operator)
    .innerJoin(user, eq(user.id, operator.userId))
    .leftJoin(alertSettings, eq(alertSettings.userId, operator.userId))
    .orderBy(asc(operator.createdAt), asc(operator.userId));
  const checked = operators.filter((one) => one.checked);
  if (checked.length > 0) {
    return checked.map((one) => ({ to: one.to, locale: one.locale ?? "en" }));
  }
  const chosen = operators.find((one) => one.locale !== null)?.locale;
  return [{ to: CONTACT_EMAIL, locale: chosen ?? "en" }];
}

/** Mails what was flagged and contested since the last mail, to each of its readers. */
export async function runModeration(db: Database, out: ModerationOut): Promise<ModerationRun> {
  const flags = await db
    .select({
      reportId: surfReportFlag.reportId,
      userId: surfReportFlag.userId,
      reason: surfReportFlag.reason,
      counts: surfReportFlag.counts,
      breakName: surfBreak.name,
      note: surfReport.note,
      state: surfReport.state,
    })
    .from(surfReportFlag)
    .innerJoin(surfReport, eq(surfReport.id, surfReportFlag.reportId))
    .innerJoin(surfBreak, eq(surfBreak.id, surfReport.breakId))
    .where(isNull(surfReportFlag.toldAt))
    .orderBy(
      asc(surfReportFlag.createdAt),
      asc(surfReportFlag.reportId),
      asc(surfReportFlag.userId),
    )
    .limit(NAMED_AT_MOST + 1);
  const contests = await db
    .select({
      contributionId: contributionVerdict.contributionId,
      userId: contributionVerdict.userId,
      reason: contributionVerdict.reason,
      value: breakContribution.value,
      breakName: surfBreak.name,
    })
    .from(contributionVerdict)
    .innerJoin(breakContribution, eq(breakContribution.id, contributionVerdict.contributionId))
    .leftJoin(surfBreak, eq(surfBreak.id, breakContribution.breakId))
    .where(and(eq(contributionVerdict.verdict, "contest"), isNull(contributionVerdict.toldAt)))
    .orderBy(
      asc(contributionVerdict.createdAt),
      asc(contributionVerdict.contributionId),
      asc(contributionVerdict.userId),
    )
    .limit(NAMED_AT_MOST + 1);
  const run = { flags: 0, contests: 0, mailed: 0, held: 0, failed: 0 };
  if (flags.length === 0 && contests.length === 0) return run;

  const named = {
    flags: flags.slice(0, NAMED_AT_MOST),
    contests: contests.slice(0, NAMED_AT_MOST),
  };
  run.flags = named.flags.length;
  run.contests = named.contests.length;
  // One mail in an hour of the clock, counted before it leaves under its own name alone. A mail
  // the provider did not take spends its hour: the next hour tries again.
  const full = await countCalls(db, [
    { provider: MODERATION_MAIL_PROVIDER, bucket: "hour", span: "hour", limit: 1 },
  ]);
  if (full) return { ...run, held: 1 };

  // A report once, with every flag of it the mail names, in the order they came.
  const reports = new Map<string, FlaggedReport>();
  for (const flag of named.flags) {
    const report = reports.get(flag.reportId) ?? {
      breakName: flag.breakName,
      note: flag.note,
      state: flag.state,
      flags: [],
    };
    report.flags.push({ reason: flag.reason, counts: flag.counts });
    reports.set(flag.reportId, report);
  }
  const lines: ContestedLine[] = named.contests.map((contest) => ({
    breakName: contest.breakName,
    value: Array.isArray(contest.value) ? contest.value.join(", ") : contest.value,
    reason: contest.reason ?? "",
  }));
  const admin = out.adminOrigin;
  const content = {
    reports: [...reports.values()],
    contests: lines,
    more: flags.length > NAMED_AT_MOST || contests.length > NAMED_AT_MOST,
    links: admin
      ? {
          reports: `${admin}/moderation?kind=reports&state=flagged`,
          guides: `${admin}/moderation?kind=guides&queue=contested`,
        }
      : null,
  };
  // One mail to each reader, one after the other.
  let mailed = 0;
  let failed = 0;
  for (const reader of await readersOf(db)) {
    const sent = await out.mailer.send(moderationMail({ ...content, ...reader }));
    if (sent === "accepted") mailed += 1;
    else failed += 1;
  }
  if (mailed === 0) return { ...run, failed };

  // What the mail named is told once one reader's mail was taken: a reader whose mail was not
  // reads it in the admin. A flag or a contest that went meanwhile, with its report or its
  // account, has nothing left to mark.
  const now = new Date();
  if (named.flags.length > 0) {
    await db
      .update(surfReportFlag)
      .set({ toldAt: now })
      .where(
        and(
          isNull(surfReportFlag.toldAt),
          or(
            ...named.flags.map((flag) =>
              and(
                eq(surfReportFlag.reportId, flag.reportId),
                eq(surfReportFlag.userId, flag.userId),
              ),
            ),
          ),
        ),
      );
  }
  if (named.contests.length > 0) {
    await db
      .update(contributionVerdict)
      .set({ toldAt: now })
      .where(
        and(
          eq(contributionVerdict.verdict, "contest"),
          isNull(contributionVerdict.toldAt),
          or(
            ...named.contests.map((contest) =>
              and(
                eq(contributionVerdict.contributionId, contest.contributionId),
                eq(contributionVerdict.userId, contest.userId),
              ),
            ),
          ),
        ),
      );
  }
  return { ...run, mailed, failed };
}

/** The job: what was flagged and contested, mailed to the instance's operators. */
export const tellModeration = (db: Database, out: ModerationOut) =>
  Effect.tryPromise({
    try: () => runModeration(db, out),
    catch: (cause) => new StoreError({ provider: "moderation", cause }),
  });

/** What a run says it did. */
export function moderationDone(run: ModerationRun): Done {
  if (run.mailed + run.held + run.failed > 0) {
    const became =
      run.held > 0
        ? "held for the hour"
        : `mailed, taken for ${run.mailed} of ${run.mailed + run.failed} readers`;
    console.log(`moderation: ${run.flags} flags and ${run.contests} contests, ${became}`);
  }
  return { counts: { ...run }, degraded: run.failed > 0 };
}
