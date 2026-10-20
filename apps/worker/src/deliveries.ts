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
  endOfToday,
  quietHoursOf,
  settingsOf,
  zoneOf,
} from "@repo/conditions/alerts/settings";
import { FORECAST_SOURCE } from "@repo/conditions/forecasts/wave-models";
import { localePrefix } from "@repo/config/locales";
import { UNREAD_NOTIFICATIONS_COUNTED } from "@repo/config/unread";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { blockedBy, toldOthers } from "@repo/db/blocks";
import { countCalls } from "@repo/db/calls";
import {
  DELIVERY_CHANNELS,
  type DeliveryClaim,
  type NotificationPayload,
  type Stretch,
  type ToldStretch,
  alert,
  alertSettings,
  alertSpot,
  notification,
  notificationDelivery,
  pushSubscription,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { unitPreferences } from "@repo/db/schema/preferences";
import { reportNotice } from "@repo/db/schema/reports";
import { type Mail, type MailSettings, type Mailer, MAIL_PROVIDER, createMailer } from "@repo/mail";
import type { AlertLine, AlertMoment } from "@repo/mail/alert-words";
import { STARTING_UNITS, alertMail } from "@repo/mail/alerts";
import {
  type ApnsPusher,
  type ApnsSettings,
  type AppDevice,
  type FcmSettings,
  type Outcome as PushOutcome,
  type Push,
  type PushSettings,
  type Pusher,
  type WebDevice,
  createApnsPusher,
  createFcmPusher,
  createPusher,
} from "@repo/push";
import { alertPush } from "@repo/push/alerts";
import { and, asc, count, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { Effect, Result } from "effect";

import {
  type Link,
  type Transaction,
  fromNow,
  interval,
  openOf,
  running,
  seaAt,
  stretch,
  named,
  toldPiece,
  toldStretch,
  watched,
  watchedOf,
  windowOf,
} from "./kept";
import { type Beginning, beginOn, hasSwitchOn, windowShown } from "./live-activities";
import { WRITE_SECONDS } from "./runs";
import { wavesNear } from "./stations";
import { StoreError } from "./store";

// Decision 031, "What is sent, and how" and "Push". A notification gets a delivery for each
// way out its account has: mail when it said yes to mail, push when a device of its own
// subscribed, a browser or the app on a phone (decision 072). A delivery says when it may
// leave, until when it is worth sending, and what became of it. The lighter pass sends what is
// due. A message is written when it leaves, from what the alert holds then: it may have waited
// for the end of the account's quiet hours.
//
// The two ways out follow the same rules and leave apart: each keeps what it told at a spot,
// each has its claims and its count for the day, and neither waits for the other. In what
// follows a "message" is a mail or a push.
//
// On an iPhone whose switch is on, "it is on" starts a Live Activity in the place of its push,
// by the rules of that push: decision 074, and `live-activities.ts`. A mail has nothing of it,
// since a Live Activity is a phone's.
//
// A message leaves in two steps. The first decides what it says, counts it, and writes that it
// is leaving, with what it tells: its claim. The second holds the account, its alerts and its
// settings, checks that nothing the message was written from has changed, hands it over, and
// writes what it told to the spots. An account that stops its mails waits for the one that is
// leaving, and none leaves once it is answered. So does a browser that is forgotten, for a push.
// A message that is not handed over after all gives its claim up, and nothing was told. A
// worker that stops before it knows leaves the claim, which is taken as told: nothing is said
// twice.

const DAY_MS = 24 * 60 * 60 * 1000;
// An account is mailed this many alert mails a day at most, counted apart from the mails that
// check its address.
export const ACCOUNT_DAILY_MAILS = 8;
// The alerts take this share of the instance's daily mails at most: the rest is for accounts
// that sign up.
const ALERTS_SHARE = 0.8;
/** The name the alert mails are counted under. An account's are under `alert-mail:<its id>`. */
export const ALERT_MAIL_PROVIDER = "alert-mail";
// An account is sent this many pushes a day at most, however many browsers it subscribed from.
export const ACCOUNT_DAILY_PUSHES = 24;
/** The name an account's pushes are counted under: `alert-push:<its id>`. */
export const ALERT_PUSH_PROVIDER = "alert-push";
// How many deliveries a run sends at most: each may take the ten seconds a mail is given, or
// a push to all the browsers of an account.
const SENT_AT_MOST = 60;
// A delivery that cannot leave yet, for want of a look or of a checked address, is read again
// this much later: it does not stand in the way of those that can.
const AGAIN_MS = 15 * 60 * 1000;
// A message is handed over only while this much of its transaction's time is left, which is
// more than one is given: the database ends a job's transaction, and would let go of the account.
const HAND_WITHIN_MS = (WRITE_SECONDS - 60) * 1000;
// A claim this old was left behind by a worker that stopped: the database ends a transaction
// that hands a message over long before.
const LEFT_BEHIND_MS = 2 * WRITE_SECONDS * 1000;
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

/**
 * What the worker sends pushes with, and the web app's address, where a push leads: a way out
 * for each kind of device, to browsers, to the app on an iPhone through Apple, and to the app on
 * an Android phone through Google. One that is null or left out is a kind the worker does not
 * reach: its devices are passed over. Decision 072.
 */
export type PushOut = {
  web: Pusher<WebDevice> | null;
  // Apple's way out also starts, updates and ends the Live Activities: decision 074.
  ios?: ApnsPusher | null;
  android?: Pusher<AppDevice> | null;
  webOrigin: string;
};

/**
 * What an instance's settings let the worker send push with: any of its three ways out, the
 * pair of keys for browsers, Apple's key and Google's account. Null with none of them, or
 * without the address of the web app, which names the instance to a browser's push service and
 * is where every push leads: the worker then sends no push. It throws on settings that cannot
 * be right, with the web app's address or without, so that the worker does not start with them.
 */
export function pushOutOf(
  settings: PushSettings & ApnsSettings & FcmSettings & { CORS_ORIGIN?: string | undefined },
): PushOut | null {
  const webOrigin = settings.CORS_ORIGIN ? new URL(settings.CORS_ORIGIN).origin : undefined;
  const web = createPusher(settings, webOrigin);
  const ios = createApnsPusher(settings);
  const android = createFcmPusher(settings);
  if (!webOrigin || (!web && !ios && !android)) return null;
  return { web, ios, android, webOrigin };
}

/** A device of an account, as `push_subscription` keeps it. */
type DeviceRow = Pick<
  typeof pushSubscription.$inferSelect,
  "id" | "kind" | "endpoint" | "token" | "environment" | "appId" | "p256dh" | "auth"
>;

/** The kinds of device a way out reaches. */
export const kindsOf = (out: PushOut) =>
  (
    [
      ["web", out.web],
      ["ios", out.ios],
      ["android", out.android],
    ] as const
  ).flatMap(([kind, way]) => (way ? [kind] : []));

/**
 * Sends a push to one device by its kind's way out. Null for a device this worker cannot reach:
 * a kind it has no way out for, or a row that does not hold what its kind is sent with.
 */
export function pushTo(
  out: PushOut,
  device: DeviceRow,
  push: Push,
  keepSeconds: number,
): Promise<PushOutcome> | null {
  const { p256dh, auth } = device;
  if (device.kind === "web") {
    if (!out.web || device.endpoint === null) return null;
    return out.web.send({ endpoint: device.endpoint, p256dh, auth }, push, keepSeconds);
  }
  const way = device.kind === "ios" ? out.ios : out.android;
  if (!way || device.token === null || device.appId === null) return null;
  return way.send(
    { token: device.token, appId: device.appId, environment: device.environment, p256dh, auth },
    push,
    keepSeconds,
  );
}

/**
 * How many things an account has not read, as the alerts' tab counts them: what its alerts told,
 * up to the page the tab lists, and the notices of reports it reads, which leave out those that
 * told only reports of accounts it blocked (decision 071). The app on a phone counts them on its
 * icon, as a push is handed over: decision 072.
 */
export async function unreadOf(tx: Transaction, userId: string) {
  const [told] = await tx
    .select({ total: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  const blocks = await blockedBy(tx, userId);
  const [notices] = await tx
    .select({ total: count() })
    .from(reportNotice)
    .where(
      and(eq(reportNotice.userId, userId), isNull(reportNotice.readAt), toldOthers(tx, blocks)),
    );
  return Math.min(told?.total ?? 0, UNREAD_NOTIFICATIONS_COUNTED) + (notices?.total ?? 0);
}

/**
 * What a push says as it is handed over: with what the account has not read when an app on a
 * phone is among its devices, which counts it on its icon. A browser reads no count.
 */
export async function counted(
  tx: Transaction,
  userId: string,
  devices: readonly Pick<DeviceRow, "kind">[],
  push: Push,
): Promise<Push> {
  if (!devices.some((device) => device.kind !== "web")) return push;
  return { ...push, badge: await unreadOf(tx, userId) };
}

/**
 * Sends a push to every device of an account that this worker reaches, at once: together they
 * take the time one is given, and all of them have answered before anything else happens.
 * Those it cannot reach are passed over. Says what became of it at each device it was sent to.
 */
export async function pushToAll(
  out: PushOut,
  devices: readonly DeviceRow[],
  push: Push,
  keepSeconds: number,
) {
  const sent = devices.flatMap((device) => {
    const sending = pushTo(out, device, push, keepSeconds);
    return sending ? [{ device, sending }] : [];
  });
  const settled = await Promise.allSettled(sent.map((one) => one.sending));
  return settled.map((one, index) => {
    if (one.status === "rejected") throw one.reason;
    return { device: sent[index]!.device, outcome: one.value };
  });
}

/** A way out of a notification. */
export type Channel = (typeof DELIVERY_CHANNELS)[number];
/** What the worker sends with, by way out. Null for a way out the instance has not. */
export type Ways = { mail: MailOut | null; push: PushOut | null };

// What a way out told at a spot of an alert is kept apart from what the other told: the open
// hours it told, and those it said to begin.
type Kept = Link["link"];
const toldBy = (channel: Channel, kept: Kept) => (channel === "mail" ? kept.mailed : kept.pushed);
const begunBy = (channel: Channel, kept: Kept) =>
  channel === "mail" ? kept.mailBegun : kept.pushBegun;
const toldAs = (channel: Channel, told: ToldStretch[]) =>
  channel === "mail" ? { mailed: told } : { pushed: told };
const begunAs = (channel: Channel, begun: Stretch[]) =>
  channel === "mail" ? { mailBegun: begun } : { pushBegun: begun };

const lastOf = (stretches: Stretch[]) =>
  stretches.reduce((latest, stretch) => Math.max(latest, new Date(stretch.end).getTime()), 0);

// The name of the window some hours are, among those a way out told: the told hours that
// begin with them, or that they are a part of. Hours it never told are named by where they
// begin.
const nameAt = (told: ToldStretch[], hours: { start: Date; end: Date }) =>
  windowOf(
    told.find((one) => new Date(one.start).getTime() === hours.start.getTime()) ??
      told.find((one) => overlaps(interval(one), hours)) ?? { start: hours.start.toISOString() },
  );

// Whether a device of the account is subscribed, of a kind the worker reaches when it is said:
// an account that has one is told by push.
async function hasDevice(
  tx: Transaction,
  userId: string,
  kinds?: readonly (typeof pushSubscription.$inferSelect)["kind"][],
) {
  const [device] = await tx
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, userId),
        kinds ? inArray(pushSubscription.kind, [...kinds]) : undefined,
      ),
    )
    .limit(1);
  return device !== undefined;
}

/**
 * Puts a notification on its way out, by each way its account has: mail when it said yes to
 * mail, push when a device of its own is subscribed. It may leave after the account's quiet
 * hours, and is worth sending until the hours it speaks of are over, or, for the evening
 * before, until the day it lists begins. What it says is decided when it leaves, for each way
 * out apart.
 */
export async function queueDeliveries(
  tx: Transaction,
  made: {
    id: string;
    userId: string;
    moment: (typeof notification.$inferSelect)["moment"];
    payload: NotificationPayload;
  },
  settings: AlertSettings,
  now: Date,
) {
  const channels: Channel[] = [];
  if (settings.byMail === true) channels.push("mail");
  if (await hasDevice(tx, made.userId)) channels.push("push");
  if (channels.length === 0) return;
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
  const dueAt = leavesAt(now, quietHoursOf(settings));
  const expiresAt = new Date(Math.min(over, midnight));
  await tx
    .insert(notificationDelivery)
    .values(channels.map((channel) => ({ notificationId: made.id, channel, dueAt, expiresAt })));
}

// What a message says: its lines, with the place of each and the names of the windows it speaks
// of there, and what it tells once it has left: by spot, the hours its way out has told then
// and those it has said to begin, and the deliveries it says in the place of.
type Said = {
  moment: AlertMoment;
  alertName: string | null;
  lines: AlertLine[];
  // The place of each line: a spot, or a break of the catalogue. Decision 064.
  places: { id: string; breakId: string | null }[];
  windows: string[][];
  // Whether deciding it wrote something to a spot it says nothing of: what its way out told
  // there, brought in line.
  aligned: boolean;
  claim: {
    told: Record<string, ToldStretch[]>;
    begun: Record<string, Stretch[]>;
    merged: string[];
  };
};
const saying = (moment: Said["moment"], alertName: string | null): Said => ({
  moment,
  alertName,
  lines: [],
  places: [],
  windows: [],
  aligned: false,
  claim: { told: {}, begun: {}, merged: [] },
});
// A claim as its delivery keeps it: what a mail told is named apart from what a push told, as
// it is at the spots.
const claimOf = (channel: Channel, said: Said, now: Date): DeliveryClaim => ({
  at: now.toISOString(),
  ...(channel === "mail" ? { mailed: said.claim.told } : { pushed: said.claim.told }),
  begun: said.claim.begun,
  merged: said.claim.merged,
});

// What the last look read of the sea for the hour some hours begin in, or for this one.
const seaOf = (one: Link, begins: Date | undefined, now: Date) => {
  const sea = begins && seaAt(one.windows, fromNow(begins, now));
  return sea ? { sea } : {};
};
const byStart = (a: { start: Date }, b: { start: Date }) => a.start.getTime() - b.start.getTime();
const overlaps = (one: { start: Date; end: Date }, other: { start: Date; end: Date }) =>
  one.start.getTime() < other.end.getTime() && one.end.getTime() > other.start.getTime();

const delivery = (notificationId: string, channel: Channel, state: "pending" | "sending") =>
  and(
    eq(notificationDelivery.notificationId, notificationId),
    eq(notificationDelivery.channel, channel),
    eq(notificationDelivery.state, state),
  );

// Settles deliveries that have nothing left to say: sent, when they were sent in part.
const finish = (tx: Transaction, channel: Channel, ids: string[], now: Date) =>
  tx
    .update(notificationDelivery)
    .set({
      state: sql`case when ${notificationDelivery.settledAt} is null then 'expired' else 'sent' end`,
      settledAt: sql`coalesce(${notificationDelivery.settledAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        inArray(notificationDelivery.notificationId, ids),
        eq(notificationDelivery.channel, channel),
        eq(notificationDelivery.state, "pending"),
      ),
    );

// A place of an alert, a spot or a break: a place may be in several, and each keeps what it was
// told there.
const linkOf = (alertId: string, placeId: string) =>
  and(eq(alertSpot.alertId, alertId), eq(alertSpot.placeId, placeId));

// Writes what a message told to the spots of its alert, as what its way out told there, and
// settles what it said in the place of. An evening's message tells nothing to a spot: it has no
// alert of its own.
async function tell(
  tx: Transaction,
  channel: Channel,
  alertId: string | null,
  claim: DeliveryClaim,
  now: Date,
) {
  const told = (channel === "mail" ? claim.mailed : claim.pushed) ?? {};
  for (const [spotId, hours] of alertId ? Object.entries(told) : []) {
    await tx
      .update(alertSpot)
      .set(toldAs(channel, hours))
      .where(linkOf(alertId ?? "", spotId));
  }
  for (const [spotId, begun] of alertId ? Object.entries(claim.begun ?? {}) : []) {
    await tx
      .update(alertSpot)
      .set(begunAs(channel, begun))
      .where(linkOf(alertId ?? "", spotId));
  }
  if (claim.merged?.length) await finish(tx, channel, claim.merged, now);
}

/**
 * Takes as told what a worker that stopped was handing over for an alert by a way out: its
 * message may have left. Says whether one of the alert is being handed over by that way at
 * this moment, by another worker, between its two steps: whatever else the alert has to say
 * by it waits, so that nothing is said twice. A mail does not wait for a push, nor a push for
 * a mail.
 */
async function honour(tx: Transaction, channel: Channel, alertId: string, now: Date) {
  const claimed = await tx
    .select({ id: notification.id, claim: notificationDelivery.claim })
    .from(notificationDelivery)
    .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
    .where(
      and(
        eq(notification.alertId, alertId),
        eq(notificationDelivery.channel, channel),
        eq(notificationDelivery.state, "sending"),
        isNotNull(notificationDelivery.claim),
      ),
    )
    .orderBy(asc(notificationDelivery.createdAt));
  let isLeaving = false;
  for (const { id, claim } of claimed) {
    if (!claim) continue;
    if (now.getTime() - new Date(claim.at).getTime() < LEFT_BEHIND_MS) {
      isLeaving = true;
      continue;
    }
    await tell(tx, channel, alertId, claim, now);
    await tx
      .update(notificationDelivery)
      .set({ claim: null })
      .where(delivery(id, channel, "sending"));
  }
  return isLeaving;
}

/**
 * What a way out has to say of an alert now: for each of its spots, how the hours that stand as
 * told differ from those it told. `said` is null when there is nothing to say, as when the
 * hours came and went while the message waited, or when another has said it. What the way out
 * told is brought in line all the same, for what no message says: hours that are over, and
 * changes that an account that switched them off is not told.
 *
 * A spot is left for later, and `waits` says so, when the last look is too old to be believed,
 * was made by a version that kept nothing of the sea, or cut the hours otherwise than the
 * account's settings do now: the next look reads it as it is.
 */
async function newsOf(
  tx: Transaction,
  channel: Channel,
  links: Link[],
  settings: AlertSettings,
  now: Date,
) {
  const said = saying("news", links[0]?.alert.name ?? null);
  const open = openOf(links, availabilityOf(settings));
  const quiet = { found: !settings.onFound, change: !settings.onChange };
  const kinds = new Set<"found" | "moved" | "gone">();
  let waits = false;
  for (const one of links) {
    const fetchedAt = one.link.forecastFetchedAt;
    if (!fetchedAt || !isFresh(one.link, now) || one.link.cutBy !== cutOf(settings, one.alert)) {
      waits = true;
      continue;
    }
    const before = toldBy(channel, one.link);
    const plan = planMail(
      before.map(toldPiece),
      one.link.told.map(toldPiece),
      one.windows.flatMap((window) =>
        open(one.place.id, { start: window.seaStart, end: window.seaEnd }),
      ),
      { now, quiet },
    );
    // What push tells now keeps the names of the windows it told: hours that moved are the
    // window they were. A mail is shown under no name.
    const fresh = plan.mailed.map(toldStretch);
    const told = channel === "push" ? named(before, fresh, plan.moves) : fresh;
    if (plan.tell.length === 0) {
      if (JSON.stringify(told) !== JSON.stringify(before)) {
        await tx
          .update(alertSpot)
          .set(toldAs(channel, told))
          .where(linkOf(one.alert.id, one.place.id));
        said.aligned = true;
      }
      continue;
    }
    said.claim.told[one.place.id] = told;
    const line: AlertLine = {
      spotName: one.place.name,
      open: [],
      forecastFetchedAt: fetchedAt,
    };
    for (const news of plan.tell) {
      kinds.add(news.moment);
      if (news.moment === "found") line.open = news.open;
      if (news.moment === "moved") line.moved = { open: news.open, before: news.before };
      if (news.moment === "gone") line.gone = news.before;
    }
    // The sea at the first of the hours that are there.
    const [begins] = [...line.open, ...(line.moved?.open ?? [])].sort(byStart);
    said.lines.push({ ...line, ...seaOf(one, begins?.start, now) });
    said.places.push(one.place);
    // The windows it speaks of: those that are there as they are named now, and those that
    // went as they were named.
    said.windows.push([
      ...[...line.open, ...(line.moved?.open ?? [])].map((piece) => nameAt(told, piece)),
      ...(line.gone ?? []).map((piece) => nameAt(before, piece)),
    ]);
  }
  const [only] = kinds;
  if (kinds.size === 1 && only) said.moment = only;
  return { said: said.lines.length > 0 ? said : null, waits };
}

/**
 * What is left to say of hours that begin, when the message leaves: the hours that the alert's
 * deliveries on their way by this way out said to begin, as the last look still finds them,
 * that are on and that it has not said to begin, with what the nearest wave station reads now.
 * One message says all that is on: two beginnings that waited together may have become the
 * same hours.
 *
 * Hours that have become later ones are not "on": `later` says when this delivery's are, and
 * it waits for them. Another delivery of the alert with later hours stays on its way too.
 */
async function beginsOf(
  tx: Transaction,
  channel: Channel,
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
        eq(notificationDelivery.channel, channel),
        eq(notificationDelivery.state, "pending"),
        ne(notification.id, made.id),
      ),
    );
  const said = saying("begins", links[0]?.alert.name ?? made.payload.alertName);
  // By spot, the hours that are on, each once. And for this delivery, the hours it waits for.
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
      // Said already by this way out, of these hours or of hours they were a part of.
      const begun = running(begunBy(channel, link.link), now).map(interval);
      const pieces = on.get(line.spotId) ?? new Map<number, { start: Date; end: Date }>();
      for (const piece of reread.due) {
        if (!begun.some((other) => overlaps(piece, other)))
          pieces.set(piece.start.getTime(), piece);
      }
      on.set(line.spotId, pieces);
      waitsFor += reread.later.length;
      if (one.id === made.id) later.push(...reread.later);
    }
    // Another delivery whose hours are all said here, or are no more, has nothing left to say.
    if (one.id !== made.id && waitsFor === 0) said.claim.merged.push(one.id);
  }
  for (const link of links) {
    const left = [...(on.get(link.place.id)?.values() ?? [])].sort(byStart);
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
    said.places.push(link.place);
    // A window that begins is the one this way out told, when it told it.
    said.windows.push(left.map((piece) => nameAt(toldBy(channel, link.link), piece)));
    said.claim.begun[link.place.id] = [
      ...running(begunBy(channel, link.link), now),
      ...left.map(stretch),
    ];
  }
  const [next] = later.sort(byStart);
  return {
    said: said.lines.length > 0 ? said : null,
    // When this delivery's later hours begin, and until when they are worth a mail.
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
  const availability = availabilityOf(settings);
  const said = saying("evening", null);
  for (const line of made.payload.lines) {
    // The spot under the alert it was listed with: it may be in several. A line written before
    // lines named their alert is of the spot's first.
    const one = links.find(
      (link) => link.place.id === line.spotId && (!line.alertId || line.alertId === link.alert.id),
    );
    const fetchedAt = one?.link.forecastFetchedAt;
    // The spot left the alert it was listed under, or the account.
    if (!one || !fetchedAt) continue;
    const left = stillOpen(
      now,
      watched(one, now),
      openOf([one], availability),
      line.open.map(interval),
    ).filter((piece) => overlaps(piece, whole));
    const [begins] = left;
    if (!begins) continue;
    said.lines.push({
      spotName: one.place.name,
      alertName: one.alert.name,
      open: left,
      ...seaOf(one, begins.start, now),
      forecastFetchedAt: fetchedAt,
    });
    said.places.push(one.place);
    // An evening is of its day, and names no window.
    said.windows.push([]);
  }
  return said.lines.length > 0 ? said : null;
}

type About = { userId: string; alertId: string | null; moment: string };

/**
 * Holds what a message depends on, in the order everything else takes it: the account, so that
 * a suspension or its deletion waits, then the alerts the message speaks of, then the account's
 * settings, so that stopping mail waits too. An evening speaks of every alert of the account.
 * Nothing of a delivery is written before all three are held: the API changes an account's
 * deliveries once it holds its settings.
 */
async function hold(tx: Transaction, made: About) {
  const [account] = await tx
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, made.userId))
    .for("share");
  const alerts = await tx
    .select({
      id: alert.id,
      enabled: alert.enabled,
      revision: alert.revision,
      awayUntil: alert.awayUntil,
    })
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
  return { account, alerts, settingsRow };
}

/**
 * What a message is written from, read once all is held: the spots it speaks of with what the
 * last look left at each and what its way out told there, and `stamp`, which is all of it with
 * the account's settings and its alerts. A message whose stamp is another when it is handed
 * over is written anew. What the other way out told is no part of it: a mail that leaves
 * meanwhile changes nothing of a push.
 */
async function writtenFrom(
  tx: Transaction,
  channel: Channel,
  made: About,
  held: Pick<Awaited<ReturnType<typeof hold>>, "alerts" | "settingsRow">,
) {
  const links =
    made.moment === "evening"
      ? await watchedOf(tx, { userId: made.userId })
      : made.alertId
        ? await watchedOf(tx, { alertId: made.alertId })
        : [];
  const stamp = JSON.stringify([
    settingsOf(held.settingsRow),
    // A pause of "Not today" too: a push of the alert on its way is written anew without the
    // day it paused (decision 072).
    held.alerts.map((one) => [one.id, one.enabled, one.revision, one.awayUntil?.getTime() ?? null]),
    links.map((one) => [
      one.place.id,
      one.alert.id,
      one.alert.shortestMinutes,
      one.link.lookedAt?.getTime() ?? null,
      one.link.cutBy,
      one.link.told,
      toldBy(channel, one.link),
      begunBy(channel, one.link),
      one.windows.map((window) => [
        window.seaStart.getTime(),
        window.seaEnd.getTime(),
        window.seen,
      ]),
    ]),
  ]);
  return { links, stamp };
}

type Outcome = "sent" | "failed" | "held" | "expired" | "skipped";
// What a delivery that is leaving hands over: a mail with the key of its link, or a push with
// the moment until which its push service is to keep it.
// A push of "it is on" also holds what the Live Activity that it starts on an iPhone shows, when
// the account had an iPhone whose switch was on as it was written: decision 074.
type Written =
  | { channel: "mail"; mail: Mail; key: string }
  | { channel: "push"; push: Push; keepUntil: Date; beginning?: Beginning | null };
export type Taken = About &
  Written & {
    day: string | undefined;
    stamp: string;
    // Some of what it has to say comes later: spots that could not be read, or hours that are
    // not on yet. It stays on its way after this message, until then and no longer than that.
    later: { dueAt: Date; expiresAt?: Date } | null;
  };

/**
 * What the Live Activity of a window that begins shows as it starts, when the account has an
 * iPhone whose switch is on: the first place it tells, with its first hours, and how many more
 * places begin with it. Decision 074.
 */
async function beginningOf(
  tx: Transaction,
  made: typeof notification.$inferSelect,
  said: Said,
  links: Link[],
  settings: AlertSettings,
  now: Date,
): Promise<Beginning | null> {
  const [line] = said.lines;
  const [place] = said.places;
  const piece = line?.open[0];
  const link = links.find((one) => one.place.id === place?.id);
  if (!made.alertId || !piece || !link || !(await hasSwitchOn(tx, made.userId))) return null;
  const shown = await windowShown(
    tx,
    {
      alertId: made.alertId,
      notificationId: made.id,
      place: link.place,
      windows: link.windows,
      window: piece,
      more: said.lines.length - 1,
      settings,
    },
    now,
  );
  return { shown, until: piece.end };
}

// Until when what a push says is worth keeping for a browser that is off: the end of the last
// hours it speaks of, where they are now or, for hours that went, where they were told. An
// evening is said the evening before: never once the day it lists has begun.
function worthUntil(said: Said, day: string | undefined, settings: AlertSettings) {
  const over = Math.max(
    ...said.lines.flatMap((line) =>
      [...line.open, ...(line.moved?.open ?? []), ...(line.gone ?? [])].map((piece) =>
        piece.end.getTime(),
      ),
    ),
    0,
  );
  const midnight =
    said.moment === "evening" && day ? dayOf(day, zoneOf(settings)).start.getTime() : over;
  return new Date(Math.min(over, midnight));
}

/**
 * Decides what becomes of a delivery that is due. When it is to leave, counts it, writes that
 * it is leaving with what it tells, and gives the message to hand over. All of it is kept
 * together, or none of it.
 */
async function takeBy(
  db: Database,
  channel: Channel,
  out: MailOut | PushOut | null,
  notificationId: string,
) {
  return db.transaction(async (tx): Promise<Outcome | Taken> => {
    const [made] = await tx.select().from(notification).where(eq(notification.id, notificationId));
    if (!made) return "skipped";
    const now = new Date();
    const { account, alerts, settingsRow } = await hold(tx, made);
    // What a worker that stopped left of the alert is taken as told before anything is read.
    const isLeaving = made.alertId ? await honour(tx, channel, made.alertId, now) : false;
    const { links, stamp } = await writtenFrom(tx, channel, made, { alerts, settingsRow });
    const pending = delivery(notificationId, channel, "pending");
    // Read once all is held: another worker may have sent it meanwhile.
    const [due] = await tx.select().from(notificationDelivery).where(pending);
    if (!due) return "skipped";
    const done = async () => {
      await finish(tx, channel, [notificationId], now);
      return due.settledAt ? ("skipped" as const) : ("expired" as const);
    };
    // Read again later, and no sooner: until then it leaves the way to those that can leave.
    const wait = async (until: Date, expiresAt?: Date) => {
      await tx
        .update(notificationDelivery)
        .set({ dueAt: until, ...(expiresAt ? { expiresAt } : {}) })
        .where(pending);
      return "skipped" as const;
    };
    const again = new Date(now.getTime() + AGAIN_MS);
    // Another message of the alert is leaving by this way out: what this one says depends on
    // what that one told.
    if (isLeaving) return wait(again);
    const isOver = due.expiresAt.getTime() <= now.getTime();
    // An evening's day is worth a message until it begins. What an alert has to tell, and
    // hours that begin, are read first: they may have become later hours.
    if (isOver && made.moment === "evening") return done();
    // An instance whose worker has not this way out keeps the notification in the list alone.
    if (!out) return isOver ? done() : "skipped";
    // What a mail leaves with, and none for a push.
    const mailOut = "mailer" in out ? out : null;

    const settings = settingsOf(settingsRow);
    const [held] = alerts;
    // The account stopped mail or was kept out. So is an alert that was deleted or switched
    // off, and a moment the account switched off.
    if (
      !account ||
      (channel === "mail" && settings.byMail !== true) ||
      (made.moment !== "evening" && (!made.alertId || !held?.enabled)) ||
      (made.moment === "begins" && !settings.onBegin) ||
      (made.moment === "evening" && !settings.onEvening) ||
      (await isSuspended(tx, made.userId))
    ) {
      return done();
    }
    // An address that is not checked yet may be before the hours are over: its mail waits.
    if (channel === "mail" && !account.emailVerified) return isOver ? done() : wait(again);
    // An account is told by push while a device of its own is subscribed that this worker
    // reaches, and no longer: a push that has no device it can reach is given up.
    if (channel === "push" && "web" in out && !(await hasDevice(tx, made.userId, kindsOf(out)))) {
      return done();
    }

    let said: Said | null;
    let later: Taken["later"] = null;
    if (made.moment === "evening") {
      said = eveningOf(made, links, settings, now);
    } else if (made.moment === "begins") {
      const begins = await beginsOf(tx, channel, made, links, settings, now);
      // Hours that have become later ones are said when they begin.
      if (!begins.said && begins.later) return wait(begins.later.dueAt, begins.later.expiresAt);
      ({ said, later } = begins);
    } else {
      const news = await newsOf(tx, channel, links, settings, now);
      // A spot that the next look has to read may still have something to say.
      if (!news.said && news.waits && !isOver) return wait(again);
      said = news.said;
      if (news.waits && !isOver) later = { dueAt: again };
    }
    if (!said) return done();

    // The quiet hours as they are now, whatever they were when it was written. A message that
    // has something to say waits for their end, and is read again then.
    const leaves = leavesAt(now, quietHoursOf(settings));
    if (leaves.getTime() > now.getTime()) return wait(leaves);

    // Counted as it is written to be leaving, in every count of its way out or in none: for a
    // mail the account's day and the instance's, for a push the account's day. A limit that is
    // reached holds it back: nothing was told, and what it had to say is said by the alert's
    // next message.
    const share = mailOut ? Math.floor(mailOut.dailyLimit * ALERTS_SHARE) : 1;
    const full =
      share < 1 ||
      (await countCalls(
        tx,
        mailOut
          ? [
              {
                provider: `${ALERT_MAIL_PROVIDER}:${made.userId}`,
                bucket: "day",
                span: "day",
                limit: ACCOUNT_DAILY_MAILS,
              },
              { provider: ALERT_MAIL_PROVIDER, bucket: "day", span: "day", limit: share },
              {
                provider: MAIL_PROVIDER,
                bucket: "day",
                span: "day",
                limit: mailOut.dailyLimit,
              },
            ]
          : [
              {
                provider: `${ALERT_PUSH_PROVIDER}:${made.userId}`,
                bucket: "day",
                span: "day",
                limit: ACCOUNT_DAILY_PUSHES,
              },
            ],
      ));
    if (full) {
      await tx.update(notificationDelivery).set({ state: "held", settledAt: now }).where(pending);
      return "held";
    }

    // The link that switches alert mails off holds a key that does that and nothing else. An
    // account that said yes before the key existed gets one here, kept before any mail holds it.
    let key = "";
    if (mailOut) {
      const [keyed] = await tx
        .update(alertSettings)
        .set({
          mailKey: sql`coalesce(${alertSettings.mailKey}, ${crypto.randomUUID()})`,
          updatedAt: sql`${alertSettings.updatedAt}`,
        })
        .where(and(eq(alertSettings.userId, made.userId), eq(alertSettings.byMail, true)))
        .returning({ key: alertSettings.mailKey });
      if (!keyed?.key) return done();
      key = keyed.key;
    }

    // From here on it may leave: it is said so, with what it tells.
    await tx
      .update(notificationDelivery)
      .set({ state: "sending", claim: claimOf(channel, said, now) })
      .where(pending);

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
    const page = `${out.webOrigin}${localePrefix(locale)}`;
    const { places } = said;
    // A line leads to the panel of its place: a spot of the account's, or a break.
    const placeQuery = (index: number) => {
      const place = places[index];
      return place?.breakId
        ? `break=${encodeURIComponent(place.breakId)}`
        : `spot=${encodeURIComponent(place?.id ?? "")}`;
    };
    // What the two ways out say alike: the moment, in the account's language, zone and units.
    const saidAs = {
      locale,
      moment: said.moment,
      alertName: said.alertName,
      zone: zoneOf(settings),
      ...(made.payload.day ? { day: made.payload.day } : {}),
      units: units ?? STARTING_UNITS,
    };
    const about = {
      userId: made.userId,
      alertId: made.alertId,
      moment: made.moment,
      day: made.payload.day,
      // Read again now that this step has written what it had to: hours it brought in line at
      // a spot it says nothing of are no change to write the message anew for.
      stamp: said.aligned
        ? (await writtenFrom(tx, channel, made, { alerts, settingsRow })).stamp
        : stamp,
      later,
    };
    if (!mailOut) {
      return {
        ...about,
        channel: "push",
        keepUntil: worthUntil(said, made.payload.day, settings),
        // What the Live Activity of the window shows, on an iPhone whose switch is on.
        beginning:
          made.moment === "begins" && made.alertId && "web" in out && out.ios
            ? await beginningOf(tx, made, said, links, settings, now)
            : null,
        push: alertPush({
          ...saidAs,
          notificationId: made.id,
          alertId: made.alertId,
          // What is left of the account's day, on its calendar: decision 072.
          today: { start: now, end: endOfToday(now, settings) },
          lines: said.lines.map((line, index) => ({
            ...line,
            spotId: places[index]?.id ?? "",
            placeQuery: placeQuery(index),
            windows: said.windows[index] ?? [],
          })),
          page,
        }),
      };
    }
    const off = `u=${encodeURIComponent(made.userId)}&k=${encodeURIComponent(key)}`;
    return {
      ...about,
      channel: "mail",
      key,
      mail: alertMail({
        ...saidAs,
        to: account.email,
        namesInSubject: settings.namesInSubject,
        lines: said.lines.map((line, index) => ({
          ...line,
          spotUrl: `${page}/app?${placeQuery(index)}`,
        })),
        forecastCredit: FORECAST_SOURCE.attribution,
        settingsUrl: `${page}/app?panel=alerts&alerts=settings`,
        offUrl: `${page}/mail-off?${off}`,
        // The page a mail program is led to is in the mail's language.
        offPostUrl: `${mailOut.apiOrigin}/v1/alert-mails/off?${off}&l=${locale}`,
      }),
    };
  });
}

/**
 * Hands a message that was written to be leaving to its way out, while the account, its alerts
 * and its settings are held: an account that stops its mails, or is kept out, waits for the
 * message that is leaving, and once it is answered none leaves. A push also holds the devices
 * it goes to: one that is forgotten, removed, or taken by another account waits for it too.
 *
 * What the message was written from is read again here. When any of it has changed since, a
 * setting, an alert, a look, the message is not handed over: its claim is given up, nothing was
 * told, and it is written anew at the next pass. What it told is written to the spots once
 * the way out has answered, whatever it answered: a message that was not taken may have left.
 */
async function handBy(db: Database, out: MailOut | PushOut, notificationId: string, taken: Taken) {
  const began = Date.now();
  const { channel } = taken;
  return db.transaction(async (tx): Promise<Outcome> => {
    const { account, alerts, settingsRow } = await hold(tx, taken);
    // The devices of the account, of every kind, held after its settings and until the push
    // has left. The API takes them last too, and holds nothing else with them. Those of a kind
    // this worker does not reach are passed over.
    const held =
      channel === "push"
        ? await tx
            .select()
            .from(pushSubscription)
            .where(eq(pushSubscription.userId, taken.userId))
            .orderBy(asc(pushSubscription.id))
            .for("update")
        : [];
    const reached = "web" in out ? kindsOf(out) : null;
    const devices = reached ? held.filter((device) => reached.includes(device.kind)) : held;
    const { stamp } = await writtenFrom(tx, channel, taken, { alerts, settingsRow });
    const sending = delivery(notificationId, channel, "sending");
    const [mine] = await tx.select().from(notificationDelivery).where(sending);
    // Taken as told meanwhile, by whoever found it left behind.
    if (!mine?.claim) return "skipped";
    const now = new Date();
    // Nothing was handed over, and nothing was told. Put back on its way, it is read again at
    // once, or when it is told to.
    const giveUp = async (state: "pending" | "expired", dueAt = now) => {
      await tx
        .update(notificationDelivery)
        .set(
          state === "pending"
            ? { state, claim: null, dueAt }
            : { state, claim: null, settledAt: now },
        )
        .where(sending);
      return state === "pending" ? ("skipped" as const) : ("expired" as const);
    };

    // The account stopped this way out or was kept out between the two steps: its mails, or
    // the last of its devices this worker reaches.
    const isStopped =
      taken.channel === "mail"
        ? !account?.emailVerified ||
          settingsRow?.byMail !== true ||
          settingsRow.mailKey !== taken.key
        : !account || devices.length === 0;
    if (isStopped || (await isSuspended(tx, taken.userId))) return giveUp("expired");
    // An evening is said the evening before: not once the day it lists has begun.
    if (taken.moment === "evening" && !isEveningOf(taken.day, settingsOf(settingsRow), now)) {
      return giveUp("expired");
    }
    // Something it was written from changed, or the hold came too late to last as long as a
    // message may take: it is written anew.
    if (stamp !== taken.stamp || Date.now() - began > HAND_WITHIN_MS) return giveUp("pending");
    // The quiet hours may have begun since it was written: it waits for their end, as one that
    // was not written yet does.
    const leaves = leavesAt(now, quietHoursOf(settingsOf(settingsRow)));
    if (leaves.getTime() > now.getTime()) return giveUp("pending", leaves);

    let isTaken: boolean;
    if (taken.channel === "mail" && "mailer" in out) {
      isTaken = (await out.mailer.send(taken.mail)) === "accepted";
    } else if (taken.channel === "push" && "web" in out) {
      // To every device at once, each by its kind's way out: together they take the time one is
      // given. All of them have answered before anything else happens: none is left to send
      // once the account is let go.
      const keepSeconds = (taken.keepUntil.getTime() - now.getTime()) / 1000;
      const push = await counted(tx, taken.userId, devices, taken.push);
      // "It is on" starts a Live Activity on an iPhone whose switch is on, in the place of its
      // push, and the push leaves to every other device: decision 074.
      const [alertHeld] = alerts;
      const begins =
        taken.moment === "begins" && taken.alertId && alertHeld && out.ios
          ? await beginOn(
              tx,
              out.ios,
              devices,
              (device) => pushTo(out, device, push, keepSeconds),
              {
                userId: taken.userId,
                alertId: taken.alertId,
                revision: alertHeld.revision,
                notificationId,
                locale: taken.push.locale ?? "en",
                keepSeconds,
                beginning: taken.beginning ?? null,
                places: Object.keys(mine.claim.begun ?? {}),
              },
              now,
            )
          : null;
      const results = begins?.results ?? (await pushToAll(out, devices, push, keepSeconds));
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
      // The activities it started or updated, after the devices.
      await begins?.write(gone.map((device) => device.id));
      // None is left: the account has no device any more, and nothing was told.
      if (gone.length === results.length) return giveUp("expired");
      isTaken = answers.includes("taken");
      // Every service said no: it did not leave, and nothing was told. It is not tried again,
      // and the alert's next push says what this one had to say. A service that did not answer
      // may have taken it: that one is told, as a mail is.
      if (!isTaken && !answers.includes("failed")) {
        await tx
          .update(notificationDelivery)
          .set({ state: "failed", claim: null, settledAt: now })
          .where(sending);
        return "failed";
      }
    } else {
      // Written for one way out and handed to the other: nothing leaves.
      return giveUp("pending");
    }
    await tell(tx, channel, taken.alertId, mine.claim, now);
    // What it has left to say stays on its way. A message that was not taken is not tried
    // again: it may have left all the same.
    await tx
      .update(notificationDelivery)
      .set(
        taken.later
          ? {
              state: "pending",
              claim: null,
              dueAt: taken.later.dueAt,
              ...(taken.later.expiresAt ? { expiresAt: taken.later.expiresAt } : {}),
              ...(isTaken ? { settledAt: now } : {}),
            }
          : { state: isTaken ? "sent" : "failed", claim: null, settledAt: now },
      )
      .where(sending);
    return isTaken ? "sent" : "failed";
  });
}

/**
 * The first step of a delivery, by the way out that `out` is: a mail's, also when the instance
 * has no way out for mail.
 */
export const take = (db: Database, out: MailOut | PushOut | null, notificationId: string) =>
  takeBy(db, out && "web" in out ? "push" : "mail", out, notificationId);

/** The second step: hands over what `take` wrote, by the way out it wrote it for. */
export const hand = handBy;

// Sends one delivery that is due, or gives it up, and says what became of it.
async function sendOne(
  db: Database,
  channel: Channel,
  out: MailOut | PushOut | null,
  notificationId: string,
) {
  const taken = await takeBy(db, channel, out, notificationId);
  if (typeof taken === "string" || !out) return taken as Outcome;
  return handBy(db, out, notificationId, taken);
}

/**
 * Sends what is due by each way out, the oldest first, and among those that left their quiet
 * hours together the one that was written first. One that fails does not stop the others. A
 * delivery that cannot leave yet is read again later, so that a run reaches those behind it: it
 * goes on until it has handed over as many messages as a run may, or has nothing left that is
 * due. An instance with no way out reads what is due once: nothing is put off.
 *
 * Each way out has its turn and its own count of what a run hands over, and the two go on at
 * the same time: pushes that are many keep no mail waiting, nor mails a push, and a run takes
 * no longer than one of them alone. The log holds counts and kinds of failures: no alert, no
 * spot and no address.
 */
export const sendDeliveries = Effect.fn("sendDeliveries")(function* (db: Database, ways: Ways) {
  const counts = {
    mail: { sent: 0, failed: 0, held: 0, expired: 0 },
    push: { sent: 0, failed: 0, held: 0, expired: 0 },
  };

  const sendBy = Effect.fn("sendBy")(function* (channel: Channel) {
    const out = ways[channel];
    const done = counts[channel];
    for (let turn = 0; turn < (out ? 10 : 1); turn += 1) {
      const due = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ notificationId: notificationDelivery.notificationId })
            .from(notificationDelivery)
            .where(
              and(
                eq(notificationDelivery.channel, channel),
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
            try: () => sendOne(db, channel, out, notificationId),
            catch: (cause) => new StoreError({ provider: "alerts", cause }),
          }),
        );
        if (Result.isFailure(result)) {
          done.failed += 1;
          yield* Effect.logWarning(
            `${channel}: an alert ${channel} could not be decided (StoreError)`,
          );
          // What could not be decided is read again later, not at the next turn.
          yield* Effect.ignore(
            Effect.tryPromise(() =>
              db
                .update(notificationDelivery)
                .set({ dueAt: new Date(Date.now() + AGAIN_MS) })
                .where(delivery(notificationId, channel, "pending")),
            ),
          );
        } else if (result.success !== "skipped") {
          done[result.success] += 1;
        }
        if (done.sent + done.failed >= SENT_AT_MOST) return;
      }
      if (due.length < SENT_AT_MOST) break;
    }
  });

  // Each turn goes to its end whatever becomes of the other: one that could not read what is
  // due stops nothing that the other is handing over.
  const turns = yield* Effect.all(
    DELIVERY_CHANNELS.map((channel) => Effect.result(sendBy(channel))),
    { concurrency: "unbounded" },
  );
  for (const turn of turns) {
    if (Result.isFailure(turn)) return yield* Effect.fail(turn.failure);
  }
  return counts;
});
