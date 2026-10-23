import { CONTACT_EMAIL } from "@repo/config/app";
import type { Locale } from "@repo/config/locales";
import type { Database } from "@repo/db";
import { countCalls } from "@repo/db/calls";
import { operator } from "@repo/db/schema/access";
import { alertSettings } from "@repo/db/schema/alerts";
import { breakContribution, contributionVerdict } from "@repo/db/schema/community";
import { surfReport, surfReportFlag } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { MAIL_PROVIDER, type MailSettings, type Mailer, createMailer } from "@repo/mail";
import { type FlaggedReport, type ContestedLine, moderationMail } from "@repo/mail/moderation";
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { Effect } from "effect";

import { DEFAULT_DAILY_MAILS } from "./deliveries";
import type { Done } from "./runs";
import { StoreError } from "./store";

// Decision 067: what accounts flagged of the reports and contested of the guides is mailed to
// the instance's address, `CONTACT_EMAIL`, so that an operator reads it within the hour, as
// Apple asks of an app whose accounts write that it acts on what is reported within a day. One
// mail in an hour of the clock at most, and none when nothing is new. A flag or a contest is
// marked told once the mail that names it was taken: one that came meanwhile, or that a mail
// left for the next, is named by the next one. The mail names nothing of the account that
// flagged but whether its flag counts.

/** The name the mail is counted under: once in an hour of the clock. */
export const MODERATION_MAIL_PROVIDER = "moderation-mail";
// How many flags, and how many contests, a mail names at most: the others wait for the next.
const NAMED_AT_MOST = 100;

/** What the worker sends the mail with, and the admin's address, which the mail links to. */
export type ModerationOut = { mailer: Mailer; adminOrigin: string | null; dailyLimit: number };

/**
 * What an instance's settings let the worker mail its address with: its way out of mail, and
 * the admin's address when it has an admin app. Null without a way out: the admin's moderation
 * is then the one place that says what waits.
 */
export function moderationOutOf(
  settings: MailSettings & {
    ADMIN_ORIGIN?: string | undefined;
    EMAIL_DAILY_LIMIT?: number | undefined;
  },
): ModerationOut | null {
  const mailer = createMailer(settings);
  if (!mailer) return null;
  return {
    mailer,
    adminOrigin: settings.ADMIN_ORIGIN ? new URL(settings.ADMIN_ORIGIN).origin : null,
    dailyLimit: settings.EMAIL_DAILY_LIMIT ?? DEFAULT_DAILY_MAILS,
  };
}

/** What a run did: what it named, and whether its mail left, waited for its hour, or failed. */
export type ModerationRun = {
  flags: number;
  contests: number;
  mailed: number;
  held: number;
  failed: number;
};

/**
 * The language the mail is written in: that of the instance's first operator who said one, in
 * the settings of their alerts, as every mail to an account takes it. English otherwise.
 */
async function operatorsLocale(db: Database): Promise<Locale> {
  const [first] = await db
    .select({ locale: alertSettings.locale })
    .from(operator)
    .innerJoin(alertSettings, eq(alertSettings.userId, operator.userId))
    .where(isNotNull(alertSettings.locale))
    .orderBy(asc(operator.createdAt), asc(operator.userId))
    .limit(1);
  return first?.locale ?? "en";
}

/** Mails what was flagged and contested since the last mail, to `to`. */
export async function runModeration(
  db: Database,
  out: ModerationOut,
  to: string = CONTACT_EMAIL,
): Promise<ModerationRun> {
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
  // One mail in an hour of the clock, counted with the instance's mails of the day, before it
  // leaves. A mail the provider did not take spends its hour: the next hour tries again.
  const full = await countCalls(db, [
    { provider: MODERATION_MAIL_PROVIDER, bucket: "hour", span: "hour", limit: 1 },
    { provider: MAIL_PROVIDER, bucket: "day", span: "day", limit: out.dailyLimit },
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
  const mail = moderationMail({
    to,
    locale: await operatorsLocale(db),
    reports: [...reports.values()],
    contests: lines,
    more: flags.length > NAMED_AT_MOST || contests.length > NAMED_AT_MOST,
    links: admin
      ? {
          reports: `${admin}/moderation?kind=reports&state=flagged`,
          guides: `${admin}/moderation?kind=guides&queue=contested`,
        }
      : null,
  });
  if ((await out.mailer.send(mail)) !== "accepted") return { ...run, failed: 1 };

  // What the mail named is told. A flag or a contest that went meanwhile, with its report or its
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
  return { ...run, mailed: 1 };
}

/** The job: what was flagged and contested, mailed to the instance's address. */
export const tellModeration = (db: Database, out: ModerationOut) =>
  Effect.tryPromise({
    try: () => runModeration(db, out),
    catch: (cause) => new StoreError({ provider: "moderation", cause }),
  });

/** What a run says it did. */
export function moderationDone(run: ModerationRun): Done {
  if (run.mailed + run.held + run.failed > 0) {
    const became = run.mailed > 0 ? "mailed" : run.held > 0 ? "held for the hour" : "not taken";
    console.log(`moderation: ${run.flags} flags and ${run.contests} contests, ${became}`);
  }
  return { counts: { ...run }, degraded: run.failed > 0 };
}
