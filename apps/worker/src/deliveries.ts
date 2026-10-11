import { planMail } from "@repo/conditions/alerts/look";
import { addDays, localTime } from "@repo/conditions/alerts/clock";
import {
  dayOf,
  isFresh,
  leavesAt,
  rereadBeginning,
  stillOpen,
} from "@repo/conditions/alerts/moments";
import {
  type AlertSettings,
  availabilityOf,
  cutOf,
  quietHoursOf,
  settingsOf,
  zoneOf,
} from "@repo/conditions/alerts/settings";
import { FORECAST_SOURCE } from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { countCalls } from "@repo/db/calls";
import {
  type NotificationPayload,
  type Stretch,
  type ToldStretch,
  alert,
  alertSettings,
  alertSpot,
  notification,
  notificationDelivery,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { unitPreferences } from "@repo/db/schema/preferences";
import { type Mail, type MailSettings, type Mailer, MAIL_PROVIDER, createMailer } from "@repo/mail";
import { type AlertMailContent, STARTING_UNITS, alertMail } from "@repo/mail/alerts";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { Effect, Result } from "effect";

import {
  type Link,
  type Transaction,
  fromNow,
  interval,
  openOf,
  seaAt,
  toldPiece,
  toldStretch,
  watched,
  watchedOf,
} from "./kept";
import { wavesNear } from "./stations";
import { StoreError } from "./store";

// Decision 031, "What is sent, and how". A notification an account wants by mail gets a
// delivery: when it may leave, until when it is worth sending, and what became of it. The
// lighter pass sends what is due. A mail is written when it leaves, from what the alert holds
// then: it may have waited for the end of the account's quiet hours.
//
// A mail leaves in two steps. The first decides what it says and writes that it is leaving,
// with what it tells: a worker that stops after that never says it twice. The second holds the
// account, its alerts and its settings, checks that nothing the mail was written from has
// changed, counts it, and hands it to the provider: an account that stops its mails waits for
// the one that is leaving, and none leaves once it is answered. A mail that is not handed over
// after all is put back as it was, with what it had to say.

const DAY_MS = 24 * 60 * 60 * 1000;
// An account is mailed this many alert mails a day at most, counted apart from the mails that
// check its address.
export const ACCOUNT_DAILY_MAILS = 8;
// The alerts take this share of the instance's daily mails at most: the rest is for accounts
// that sign up.
const ALERTS_SHARE = 0.8;
/** The name the alert mails are counted under. An account's are under `alert-mail:<its id>`. */
export const ALERT_MAIL_PROVIDER = "alert-mail";
// How many deliveries a run sends at most: each may take a mail's ten seconds.
const SENT_AT_MOST = 60;
// A delivery that cannot leave yet, for want of a look or of a checked address, is read again
// this much later: it does not stand in the way of those that can.
const AGAIN_MS = 15 * 60 * 1000;
/** How many mails the instance lets out in a day, unless its settings say otherwise. */
const DEFAULT_DAILY_MAILS = 200;

/** What the worker sends alert mails with: the way out, and the two addresses a mail links to. */
export type MailOut = {
  mailer: Mailer;
  webOrigin: string;
  apiOrigin: string;
  dailyLimit: number;
};

/**
 * What an instance's settings let the worker send mail with. Null without a way out, or
 * without the addresses of the web app and of the API: the worker then sends no alert mail,
 * and the notifications stay in the web app's list.
 */
export function mailOutOf(
  settings: MailSettings & {
    CORS_ORIGIN?: string | undefined;
    BETTER_AUTH_URL?: string | undefined;
    EMAIL_DAILY_LIMIT?: number | undefined;
  },
): MailOut | null {
  const mailer = createMailer(settings);
  if (!mailer || !settings.CORS_ORIGIN || !settings.BETTER_AUTH_URL) return null;
  return {
    mailer,
    webOrigin: new URL(settings.CORS_ORIGIN).origin,
    apiOrigin: new URL(settings.BETTER_AUTH_URL).origin,
    dailyLimit: settings.EMAIL_DAILY_LIMIT ?? DEFAULT_DAILY_MAILS,
  };
}

const lastOf = (stretches: Stretch[]) =>
  stretches.reduce((latest, stretch) => Math.max(latest, new Date(stretch.end).getTime()), 0);

/**
 * Puts a notification on its way out by mail, when its account wants mail. It may leave after
 * the account's quiet hours, and is worth sending until the hours it speaks of are over, or,
 * for the evening before, until the day it lists begins. What the mail says is decided when it
 * leaves.
 */
export async function queueMail(
  tx: Transaction,
  made: {
    id: string;
    moment: (typeof notification.$inferSelect)["moment"];
    payload: NotificationPayload;
  },
  settings: AlertSettings,
  now: Date,
) {
  if (settings.byMail !== true) return;
  // The end of the hours it speaks of: those it lists, or those it calls off.
  const ends = Math.max(
    ...made.payload.lines.map((line) =>
      lastOf(made.moment === "gone" ? (line.before ?? []) : line.open),
    ),
    0,
  );
  const over = ends > 0 ? ends : now.getTime() + DAY_MS;
  // An evening is said the evening before, never after midnight.
  const midnight =
    made.moment === "evening" && made.payload.day
      ? dayOf(made.payload.day, made.payload.zone).start.getTime()
      : over;
  await tx.insert(notificationDelivery).values({
    notificationId: made.id,
    channel: "mail",
    dueAt: leavesAt(now, quietHoursOf(settings)),
    expiresAt: new Date(Math.min(over, midnight)),
  });
}

type MailLine = AlertMailContent["lines"][number];
// What a mail says: its lines, the spot of each, and what it tells once it has left.
type Said = {
  moment: AlertMailContent["moment"];
  alertName: string | null;
  lines: Omit<MailLine, "spotUrl">[];
  spotIds: string[];
  // By spot, the hours mail told before, and those it has told once this has left.
  mailed: Map<string, { before: ToldStretch[]; after: ToldStretch[] }>;
  // The deliveries that this mail says in their place: they have nothing left to say.
  merged: string[];
};

// What the last look read of the sea for the hour some hours begin in, or for this one.
const seaOf = (one: Link, begins: Date | undefined, now: Date) => {
  const sea = begins && seaAt(one.windows, fromNow(begins, now));
  return sea ? { sea } : {};
};

// The spots a mail speaks of: those of its alert, or of every alert of the account for an
// evening.
const linksOf = (tx: Transaction, made: { userId: string; alertId: string | null }) =>
  watchedOf(tx, made.alertId ? { alertId: made.alertId } : { userId: made.userId });

/**
 * What mail has to say of an alert now: for each of its spots, how the hours that stand as told
 * differ from those mail told. `said` is null when there is nothing to say, as when the hours
 * came and went while the mail waited, or when another mail has said it. What mail told is
 * brought in line all the same, for what no mail says: hours that are over, and changes that an
 * account that switched them off is not told.
 *
 * A spot is left for later, and `waits` says so, when the last look is too old to be believed,
 * was made by a version that kept nothing of the sea, or cut the hours otherwise than the
 * account's settings do now: the next look reads it as it is.
 */
async function newsOf(tx: Transaction, links: Link[], settings: AlertSettings, now: Date) {
  const said: Said = {
    moment: "news",
    alertName: links[0]?.alert.name ?? null,
    lines: [],
    spotIds: [],
    mailed: new Map(),
    merged: [],
  };
  const open = openOf(links, availabilityOf(settings));
  const quiet = { found: !settings.onFound, change: !settings.onChange };
  const kinds = new Set<"found" | "moved" | "gone">();
  let waits = false;
  for (const one of links) {
    const fetchedAt = one.link.forecastFetchedAt;
    if (
      !fetchedAt ||
      !isFresh(one.link, now) ||
      one.link.cutBy !== cutOf(settings, one.alert.shortestMinutes)
    ) {
      waits = true;
      continue;
    }
    const plan = planMail(
      one.link.mailed.map(toldPiece),
      one.link.told.map(toldPiece),
      one.windows.flatMap((window) =>
        open(one.place.id, { start: window.seaStart, end: window.seaEnd }),
      ),
      { now, quiet },
    );
    const mailed = plan.mailed.map(toldStretch);
    if (plan.tell.length === 0) {
      if (JSON.stringify(mailed) !== JSON.stringify(one.link.mailed)) {
        await tx.update(alertSpot).set({ mailed }).where(eq(alertSpot.spotId, one.place.id));
      }
      continue;
    }
    said.mailed.set(one.place.id, { before: one.link.mailed, after: mailed });
    const line: Omit<MailLine, "spotUrl"> = {
      spotName: one.place.name,
      open: [],
      forecastFetchedAt: fetchedAt,
    };
    for (const told of plan.tell) {
      kinds.add(told.moment);
      if (told.moment === "found") line.open = told.open;
      if (told.moment === "moved") line.moved = { open: told.open, before: told.before };
      if (told.moment === "gone") line.gone = told.before;
    }
    // The sea at the first of the hours that are there.
    const [begins] = [...line.open, ...(line.moved?.open ?? [])].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
    said.lines.push({ ...line, ...seaOf(one, begins?.start, now) });
    said.spotIds.push(one.place.id);
  }
  const [only] = kinds;
  if (kinds.size === 1 && only) said.moment = only;
  return { said: said.lines.length > 0 ? said : null, waits };
}

/**
 * What is left to say of hours that begin, when the mail leaves: the hours that the alert's
 * deliveries on their way said to begin, as the last look still finds them, with what the
 * nearest wave station reads now. One mail says all that is on: two beginnings that waited
 * together may have become the same hours. A delivery whose hours have all become later ones
 * is not "on": `later` says when it is, and it waits until then.
 */
async function beginsOf(
  tx: Transaction,
  made: typeof notification.$inferSelect,
  links: Link[],
  settings: AlertSettings,
  now: Date,
) {
  const open = openOf(links, availabilityOf(settings));
  // What else of the alert waits to say that it is on.
  const others = await tx
    .select({ id: notification.id, payload: notification.payload })
    .from(notificationDelivery)
    .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
    .where(
      and(
        eq(notification.alertId, made.alertId ?? ""),
        eq(notification.moment, "begins"),
        eq(notificationDelivery.channel, "mail"),
        eq(notificationDelivery.state, "pending"),
        ne(notification.id, made.id),
      ),
    );
  const said: Said = {
    moment: "begins",
    alertName: links[0]?.alert.name ?? made.payload.alertName,
    lines: [],
    spotIds: [],
    mailed: new Map(),
    merged: [],
  };
  // By spot, the hours that are on, each once. And for this delivery, the hours it must wait for.
  const on = new Map<string, Map<number, { start: Date; end: Date }>>();
  const later: { start: Date; end: Date }[] = [];
  for (const one of [made, ...others]) {
    let waitsFor = 0;
    for (const line of one.payload.lines) {
      const link = links.find((other) => other.place.id === line.spotId);
      // A look by a version that kept nothing of the sea has nothing to give of it: the list
      // says that it is on, and the mail is not sent.
      if (!link?.link.forecastFetchedAt) continue;
      const reread = rereadBeginning(
        now,
        watched(link, now),
        open,
        line.open.map(interval),
        settings.noticeMinutes,
      );
      const pieces = on.get(line.spotId) ?? new Map<number, { start: Date; end: Date }>();
      for (const piece of reread.due) pieces.set(piece.start.getTime(), piece);
      on.set(line.spotId, pieces);
      waitsFor += reread.later.length;
      if (one.id === made.id) later.push(...reread.later);
    }
    // Another delivery whose hours are all said here, or are no more, has nothing left to say.
    if (one.id !== made.id && waitsFor === 0) said.merged.push(one.id);
  }
  for (const link of links) {
    const left = [...(on.get(link.place.id)?.values() ?? [])].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
    const [begins] = left;
    if (!begins || !link.link.forecastFetchedAt) continue;
    // The station's reading is read as the mail leaves: the one it was written with is old.
    const station = await wavesNear(tx, link.place, now);
    said.lines.push({
      spotName: link.place.name,
      open: left,
      ...seaOf(link, begins.start, now),
      forecastFetchedAt: link.link.forecastFetchedAt,
      ...(station ? { station: { ...station, observedAt: new Date(station.observedAt) } } : {}),
    });
    said.spotIds.push(link.place.id);
  }
  if (said.lines.length > 0) return { said, later: null };
  const [next] = later.sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    said: null,
    later: next
      ? {
          dueAt: new Date(next.start.getTime() - settings.noticeMinutes * 60 * 1000),
          expiresAt: new Date(Math.max(...later.map((piece) => piece.end.getTime()))),
        }
      : null,
  };
}

// Whether the day an evening lists is still the account's next day, on its calendar as it is.
const isEveningOf = (day: string | undefined, settings: AlertSettings, now: Date) =>
  day !== undefined && addDays(localTime(now, zoneOf(settings)).date, 1) === day;

/**
 * What is left to say of an evening's day, when the mail leaves: the hours it listed that the
 * last look still finds, at spots that are still in the alert they were in. Null when none are
 * left, or when the day it lists is no longer the account's next day: an evening is said the
 * evening before, on the account's calendar as it is now.
 */
function eveningOf(
  made: typeof notification.$inferSelect,
  links: Link[],
  settings: AlertSettings,
  now: Date,
): Said | null {
  const { day } = made.payload;
  if (!day || !isEveningOf(day, settings, now)) return null;
  const whole = dayOf(day, zoneOf(settings));
  const of = new Map(links.map((one) => [one.place.id, one]));
  const open = openOf(links, availabilityOf(settings));
  const said: Said = {
    moment: "evening",
    alertName: null,
    lines: [],
    spotIds: [],
    mailed: new Map(),
    merged: [],
  };
  for (const line of made.payload.lines) {
    const one = of.get(line.spotId);
    const fetchedAt = one?.link.forecastFetchedAt;
    // The spot left the alert it was listed under, or the account.
    if (!one || !fetchedAt || (line.alertId && line.alertId !== one.alert.id)) continue;
    const left = stillOpen(now, watched(one, now), open, line.open.map(interval)).filter(
      (piece) =>
        piece.start.getTime() < whole.end.getTime() && piece.end.getTime() > whole.start.getTime(),
    );
    const [begins] = left;
    if (!begins) continue;
    said.lines.push({
      spotName: one.place.name,
      alertName: one.alert.name,
      open: left,
      ...seaOf(one, begins.start, now),
      forecastFetchedAt: fetchedAt,
    });
    said.spotIds.push(one.place.id);
  }
  return said.lines.length > 0 ? said : null;
}

const delivery = (notificationId: string, state: "pending" | "sending") =>
  and(
    eq(notificationDelivery.notificationId, notificationId),
    eq(notificationDelivery.channel, "mail"),
    eq(notificationDelivery.state, state),
  );

type About = { userId: string; alertId: string | null; moment: string };

/**
 * Holds what a mail depends on, in the order everything else takes it: the account, so that a
 * suspension or its deletion waits, then the alerts the mail speaks of, then the account's
 * settings, so that stopping mail waits too. An evening speaks of every alert of the account.
 * What the mail is written from is read once all is held, and `stamp` is all of it: the
 * account's settings, its alerts, and what the last look left at each spot.
 */
async function hold(tx: Transaction, made: About) {
  const [account] = await tx
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, made.userId))
    .for("share");
  const alerts = await tx
    .select({ id: alert.id, enabled: alert.enabled, revision: alert.revision })
    .from(alert)
    .where(
      made.moment === "evening" ? eq(alert.userId, made.userId) : eq(alert.id, made.alertId ?? ""),
    )
    .orderBy(asc(alert.id))
    .for("update");
  const [settingsRow] = await tx
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.userId, made.userId))
    .for("update");
  const links =
    made.moment === "evening" || made.alertId
      ? await linksOf(tx, made.moment === "evening" ? { ...made, alertId: null } : made)
      : [];
  const stamp = JSON.stringify([
    settingsOf(settingsRow),
    alerts.map((one) => [one.id, one.enabled, one.revision]),
    links.map((one) => [
      one.place.id,
      one.alert.id,
      one.alert.shortestMinutes,
      one.link.lookedAt?.getTime() ?? null,
      one.link.cutBy,
      one.link.told,
      one.windows.map((window) => [
        window.seaStart.getTime(),
        window.seaEnd.getTime(),
        window.seen,
      ]),
    ]),
  ]);
  return { account, alerts, settingsRow, links, stamp };
}

type Outcome = "sent" | "failed" | "held" | "expired" | "skipped";
export type Taken = About & {
  mail: Mail;
  key: string;
  day: string | undefined;
  stamp: string;
  mailed: Said["mailed"];
  merged: string[];
  // Some of the alert's spots could not be read: what they have to say comes later.
  waits: boolean;
};

/**
 * Decides what becomes of a delivery that is due. When it is to leave, writes that it is
 * leaving, with what it tells, and gives the mail to hand over. All of it is kept together, or
 * none of it.
 */
export async function take(db: Database, out: MailOut | null, notificationId: string) {
  return db.transaction(async (tx): Promise<Outcome | Taken> => {
    const [made] = await tx.select().from(notification).where(eq(notification.id, notificationId));
    if (!made) return "skipped";
    const { account, alerts, settingsRow, links, stamp } = await hold(tx, made);
    // Read once all is held: another worker may have sent it meanwhile.
    const [due] = await tx
      .select()
      .from(notificationDelivery)
      .where(delivery(notificationId, "pending"));
    if (!due) return "skipped";
    const now = new Date();
    // What was sent in part and has nothing more to say was sent.
    const done = async (ids = [notificationId]) => {
      await tx
        .update(notificationDelivery)
        .set({
          state: sql`case when ${notificationDelivery.settledAt} is null then 'expired' else 'sent' end`,
          settledAt: sql`coalesce(${notificationDelivery.settledAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            inArray(notificationDelivery.notificationId, ids),
            eq(notificationDelivery.channel, "mail"),
            eq(notificationDelivery.state, "pending"),
          ),
        );
      return due.settledAt ? ("skipped" as const) : ("expired" as const);
    };
    // Read again later, and no sooner: until then it leaves the way to those that can leave.
    const wait = async (until: Date, expiresAt?: Date) => {
      await tx
        .update(notificationDelivery)
        .set({ dueAt: until, ...(expiresAt ? { expiresAt } : {}) })
        .where(delivery(notificationId, "pending"));
      return "skipped" as const;
    };
    const again = new Date(now.getTime() + AGAIN_MS);
    const isOver = due.expiresAt.getTime() <= now.getTime();
    const isNews = made.moment === "found" || made.moment === "moved" || made.moment === "gone";
    // Hours that begin, or an evening's day, are worth a mail until they are over. What an
    // alert has to tell is read first: its hours may have become later ones.
    if (isOver && !isNews) return done();
    // An instance whose worker has no way out keeps the notification in the list alone.
    if (!out) return isOver ? done() : "skipped";

    const settings = settingsOf(settingsRow);
    const [held] = alerts;
    // The account stopped mail or was kept out. So is an alert that was deleted or switched
    // off, and a moment the account switched off.
    if (
      !account ||
      settings.byMail !== true ||
      (made.moment !== "evening" && (!made.alertId || !held?.enabled)) ||
      (made.moment === "begins" && !settings.onBegin) ||
      (made.moment === "evening" && !settings.onEvening) ||
      (await isSuspended(tx, made.userId))
    ) {
      return done();
    }
    // An address that is not checked yet may be before the hours are over: its mail waits.
    if (!account.emailVerified) return isOver ? done() : wait(again);

    let said: Said | null;
    let waits = false;
    if (isNews) {
      const news = await newsOf(tx, links, settings, now);
      // A spot that the next look has to read may still have something to say.
      if (!news.said && news.waits && !isOver) return wait(again);
      ({ said, waits } = news);
    } else if (made.moment === "begins") {
      const begins = await beginsOf(tx, made, links, settings, now);
      // Hours that have become later ones are said when they begin.
      if (!begins.said && begins.later) return wait(begins.later.dueAt, begins.later.expiresAt);
      said = begins.said;
    } else {
      said = eveningOf(made, links, settings, now);
    }
    if (!said) return done();

    // The quiet hours as they are now, whatever they were when it was written. A mail that
    // has something to say waits for their end, and is read again then.
    const leaves = leavesAt(now, quietHoursOf(settings));
    if (leaves.getTime() > now.getTime()) return wait(leaves);

    // The link that switches alert mails off holds a key that does that and nothing else. An
    // account that said yes before the key existed gets one here, kept before any mail holds it.
    const [keyed] = await tx
      .update(alertSettings)
      .set({
        mailKey: sql`coalesce(${alertSettings.mailKey}, ${crypto.randomUUID()})`,
        updatedAt: sql`${alertSettings.updatedAt}`,
      })
      .where(and(eq(alertSettings.userId, made.userId), eq(alertSettings.byMail, true)))
      .returning({ key: alertSettings.mailKey });
    if (!keyed?.key) return done();

    // From here on it may leave: it is said so, and what it tells is told. A worker that stops
    // before the provider answers leaves both as they are, and nothing is said twice.
    await tx
      .update(notificationDelivery)
      .set({ state: "sending" })
      .where(delivery(notificationId, "pending"));
    for (const [spotId, { after }] of said.mailed) {
      await tx.update(alertSpot).set({ mailed: after }).where(eq(alertSpot.spotId, spotId));
    }
    if (said.merged.length > 0) await done(said.merged);

    const locale = settings.locale ?? "en";
    // The units the account reads its screens in: decision 033.
    const [units] = await tx
      .select({
        windSpeed: unitPreferences.windSpeed,
        height: unitPreferences.height,
        distance: unitPreferences.distance,
      })
      .from(unitPreferences)
      .where(eq(unitPreferences.userId, made.userId));
    const page = `${out.webOrigin}${locale === "fr" ? "/fr" : ""}`;
    const off = `u=${encodeURIComponent(made.userId)}&k=${encodeURIComponent(keyed.key)}`;
    const spotIds = said.spotIds;
    return {
      userId: made.userId,
      alertId: made.alertId,
      moment: made.moment,
      key: keyed.key,
      day: made.payload.day,
      stamp,
      mailed: said.mailed,
      merged: said.merged,
      waits,
      mail: alertMail({
        to: account.email,
        locale,
        moment: said.moment,
        alertName: said.alertName,
        zone: zoneOf(settings),
        ...(made.payload.day ? { day: made.payload.day } : {}),
        namesInSubject: settings.namesInSubject,
        units: units ?? STARTING_UNITS,
        lines: said.lines.map((line, index) => ({
          ...line,
          spotUrl: `${page}/app?spot=${encodeURIComponent(spotIds[index] ?? "")}`,
        })),
        forecastCredit: FORECAST_SOURCE.attribution,
        settingsUrl: `${page}/app?panel=alerts&alerts=settings`,
        offUrl: `${page}/mail-off?${off}`,
        // The page a mail program is led to is in the mail's language.
        offPostUrl: `${out.apiOrigin}/v1/alert-mails/off?${off}&l=${locale}`,
      }),
    };
  });
}

/**
 * Hands a mail that was written to be leaving to the provider, while the account, its alerts
 * and its settings are held: an account that stops its mails, or is kept out, waits for the
 * mail that is leaving, and once it is answered no mail leaves.
 *
 * What the mail was written from is read again here. When any of it has changed since, a
 * setting, an alert, a look, the mail is not handed over: it is put back on its way with what
 * it had to say, and written anew at the next pass. It is counted here, as it leaves: a limit
 * that is reached holds it back, and what it had to say stays to be said by a later mail.
 */
export async function hand(db: Database, out: MailOut, notificationId: string, taken: Taken) {
  return db.transaction(async (tx): Promise<Outcome> => {
    const { account, settingsRow, stamp } = await hold(tx, taken);
    const sending = delivery(notificationId, "sending");
    const now = new Date();
    const settle = async (state: "sent" | "failed" | "expired") => {
      await tx.update(notificationDelivery).set({ state, settledAt: now }).where(sending);
      return state;
    };
    // Nothing was handed over: what it told is told no more, and what it said in the place
    // of others is theirs to say again.
    const putBack = async (state: "pending" | "held") => {
      for (const [spotId, { before, after }] of taken.mailed) {
        await tx
          .update(alertSpot)
          .set({ mailed: before })
          .where(
            and(
              eq(alertSpot.spotId, spotId),
              // Unless a look has brought it in line since, which stands.
              sql`${alertSpot.mailed} = ${JSON.stringify(after)}::jsonb`,
            ),
          );
      }
      if (taken.merged.length > 0) {
        await tx
          .update(notificationDelivery)
          .set({ state: "pending", settledAt: null })
          .where(
            and(
              inArray(notificationDelivery.notificationId, taken.merged),
              eq(notificationDelivery.channel, "mail"),
              eq(notificationDelivery.state, "expired"),
            ),
          );
      }
      await tx
        .update(notificationDelivery)
        .set(state === "held" ? { state, settledAt: now } : { state, dueAt: now })
        .where(sending);
      return state === "held" ? ("held" as const) : ("skipped" as const);
    };

    // The account stopped mail or was kept out between the two steps: the mail is given up.
    if (
      !account?.emailVerified ||
      settingsRow?.byMail !== true ||
      settingsRow.mailKey !== taken.key ||
      (await isSuspended(tx, taken.userId))
    ) {
      return settle("expired");
    }
    // An evening is said the evening before: not once the day it lists has begun.
    if (taken.moment === "evening" && !isEveningOf(taken.day, settingsOf(settingsRow), now)) {
      return settle("expired");
    }
    if (stamp !== taken.stamp) return putBack("pending");

    // Counted as it leaves, in the account's day and in the instance's, or in none.
    const share = Math.floor(out.dailyLimit * ALERTS_SHARE);
    const full =
      share < 1 ||
      (await countCalls(tx, [
        {
          provider: `${ALERT_MAIL_PROVIDER}:${taken.userId}`,
          bucket: "day",
          span: "day",
          limit: ACCOUNT_DAILY_MAILS,
        },
        { provider: ALERT_MAIL_PROVIDER, bucket: "day", span: "day", limit: share },
        { provider: MAIL_PROVIDER, bucket: "day", span: "day", limit: out.dailyLimit },
      ]));
    if (full) return putBack("held");

    // A mail the provider did not take is not tried again: it may have left all the same.
    const outcome = await out.mailer.send(taken.mail);
    if (outcome !== "accepted") return settle("failed");
    // Spots that could not be read may still have something to say: it stays on its way.
    if (taken.waits) {
      await tx
        .update(notificationDelivery)
        .set({ state: "pending", settledAt: now, dueAt: new Date(now.getTime() + AGAIN_MS) })
        .where(sending);
      return "sent";
    }
    return settle("sent");
  });
}

// Sends one delivery that is due, or gives it up, and says what became of it.
async function sendOne(db: Database, out: MailOut | null, notificationId: string) {
  const taken = await take(db, out, notificationId);
  if (typeof taken === "string" || !out) return taken as Outcome;
  return hand(db, out, notificationId, taken);
}

/**
 * Sends the alert mails that are due, the oldest first, and among those that left their quiet
 * hours together the one that was written first. One that fails does not stop the others. A
 * delivery that cannot leave yet is read again later, so that a run reaches those behind it: it
 * goes on until it has handed over as many mails as a run may, or has nothing left that is due.
 * The log holds counts and kinds of failures: no alert, no spot and no address.
 */
export const sendDeliveries = Effect.fn("sendDeliveries")(function* (
  db: Database,
  out: MailOut | null,
) {
  const counts = { sent: 0, failed: 0, held: 0, expired: 0 };
  // An instance with no way out reads what is due once: nothing is put off.
  for (let turn = 0; turn < (out ? 10 : 1); turn += 1) {
    const due = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ notificationId: notificationDelivery.notificationId })
          .from(notificationDelivery)
          .where(
            and(
              eq(notificationDelivery.channel, "mail"),
              eq(notificationDelivery.state, "pending"),
              lte(notificationDelivery.dueAt, new Date()),
            ),
          )
          .orderBy(
            asc(notificationDelivery.dueAt),
            asc(notificationDelivery.createdAt),
            asc(notificationDelivery.notificationId),
          )
          .limit(SENT_AT_MOST),
      catch: (cause) => new StoreError({ provider: "alerts", cause }),
    });
    for (const { notificationId } of due) {
      const result = yield* Effect.result(
        Effect.tryPromise({
          try: () => sendOne(db, out, notificationId),
          catch: (cause) => new StoreError({ provider: "alerts", cause }),
        }),
      );
      if (Result.isFailure(result)) {
        counts.failed += 1;
        yield* Effect.logWarning("mail: an alert mail could not be decided (StoreError)");
        // What could not be decided is read again later, not at the next turn.
        yield* Effect.ignore(
          Effect.tryPromise(() =>
            db
              .update(notificationDelivery)
              .set({ dueAt: new Date(Date.now() + AGAIN_MS) })
              .where(delivery(notificationId, "pending")),
          ),
        );
      } else if (result.success !== "skipped") {
        counts[result.success] += 1;
      }
      if (counts.sent + counts.failed >= SENT_AT_MOST) return counts;
    }
    if (due.length < SENT_AT_MOST) break;
  }
  return counts;
});
