import { createHash } from "node:crypto";

import { LOOKS_TO_CALL_OFF } from "@repo/conditions/alerts/look";
import { isFresh, stillOpen } from "@repo/conditions/alerts/moments";
import type { Interval } from "@repo/conditions/alerts/open";
import {
  type AlertSettings,
  availabilityOf,
  endOfToday,
  settingsOf,
} from "@repo/conditions/alerts/settings";
import { shoreWind } from "@repo/conditions/shore-wind";
import { predictTideExtremes } from "@repo/conditions/tides/tide-prediction";
import { APP_SCHEME } from "@repo/config/app";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import {
  type SeaHour,
  alert,
  alertSettings,
  liveActivity,
  pushSubscription,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import type { Locale } from "@repo/mail/verification";
import type { ApnsPusher, Outcome, WindowShown } from "@repo/push";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { Effect, Result } from "effect";

import {
  type Link,
  type Transaction,
  fromNow,
  openOf,
  running,
  seaAt,
  watched,
  watchedOf,
} from "./kept";
import { wavesNear, windNear } from "./stations";
import { StoreError } from "./store";

// Decision 074, "When a window begins, on an iPhone". "It is on" starts a Live Activity on an
// iPhone whose switch is on, in the place of its push: `handBy` in `deliveries.ts` hands it over
// and writes its row of `live_activity`. What follows is what the activity shows, and the job
// that follows it every quarter of an hour: it updates the activities that run when what they
// show has changed, and ends those that should end. It reads no forecast: the hour now among the
// window's hours, as the last look kept them, the buoy and the wind of the stations near, how
// that wind meets the shore, and the next tide, which it computes.
//
// What Apple reads of it is figures, times, and the ids of the alert and the notification: never
// a name, and no id of a break or a station, whose names anyone reads from them. Its token is
// kept as a device's is: it is never logged.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// How far ahead the next tide is looked for.
const TIDE_AHEAD_MS = 26 * HOUR_MS;
// How long Apple keeps the end of an activity for a phone that is off.
const END_KEPT_SECONDS = 60 * 60;
// iOS ends an activity eight hours after it started, and takes it off the lock screen four hours
// later at most: what is sent to it after that shows nothing.
const IOS_RUNS_MS = 8 * HOUR_MS;
const IOS_SHOWS_MS = IOS_RUNS_MS + 4 * HOUR_MS;
// An activity that ended is kept this long, so that an app that says it is still running is
// told it ended, then forgotten with its token.
const ENDED_KEPT_MS = DAY_MS;
// How long a run follows activities: each may take the ten seconds a push is given, and a run is
// stopped after a quarter of an hour. What is left is followed by the next run.
const FOLLOWED_FOR_MS = 10 * 60 * 1000;

/** Where a press on the activity leads: what the alerts told, by the app's own scheme. */
export const ACTIVITY_URL = `${APP_SCHEME}://app?panel=alerts`;

/** A place of an alert, as the activity reads where it is. */
type Place = Pick<Link["place"], "id" | "breakId" | "latitude" | "longitude" | "name">;

// A figure as the activity writes it: as precise as its screen shows it, so that an update
// leaves for what a person sees, and for nothing else.
const tenths = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value * 10) / 10;
const whole = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value);
// A moment the activity computes, to the minute: the next tide is computed from a timeline that
// starts where the run does, and comes out a fraction of a second apart from one run to the next.
const toMinute = (moment: Date) => new Date(Math.round(moment.getTime() / MINUTE_MS) * MINUTE_MS);

/** A hash of what an activity shows, which its row keeps: an update leaves when it changes. */
export const shownHash = (shown: WindowShown) =>
  createHash("sha256").update(JSON.stringify(shown)).digest("base64url").slice(0, 22);

// Where the wind blows from when it blows off the shore at a place: a break's in the catalogue,
// and a spot's in what its owner said of it. Null where nobody has said.
async function offshoreOf(tx: Transaction, place: Place) {
  if (place.breakId) {
    const [found] = await tx
      .select({ offshore: surfBreak.offshoreDirectionDegrees })
      .from(surfBreak)
      .where(eq(surfBreak.id, place.breakId));
    return found?.offshore ?? null;
  }
  const [found] = await tx
    .select({ characteristics: spot.characteristics })
    .from(spot)
    .where(eq(spot.id, place.id));
  return found?.characteristics?.offshoreDirectionDegrees ?? null;
}

/**
 * What the activity of a window shows now: the window at its first place, how many more places
 * are on, what the last look read of the sea for the hour now, the wind a station near measured
 * lately, or the forecast's, with how it meets the shore, the next tide and the nearest buoy's
 * reading. A place that is no more shows the window and nothing of the sea.
 */
export async function windowShown(
  tx: Transaction,
  at: {
    alertId: string;
    notificationId: string;
    place: Place | null;
    windows: { hours: SeaHour[] }[];
    window: Interval;
    more: number;
    settings: AlertSettings;
  },
  now: Date,
): Promise<WindowShown> {
  const { place } = at;
  const hour = seaAt(at.windows, fromNow(at.window.start, now));
  const [offshore, wind, buoy] = place
    ? await Promise.all([
        offshoreOf(tx, place),
        windNear(tx, place, now),
        wavesNear(tx, place, now),
      ])
    : [null, null, null];
  const tide = place
    ? predictTideExtremes({
        latitude: place.latitude,
        longitude: place.longitude,
        start: now,
        end: new Date(now.getTime() + TIDE_AHEAD_MS),
      })?.extremes[0]
    : undefined;
  // What a station measured, or else what the forecast gave for the hour.
  const blows = wind
    ? {
        observedAt: wind.observedAt.toISOString(),
        speed: wind.speedMetersPerSecond,
        gust: wind.gustMetersPerSecond,
        direction: wind.directionDegrees,
      }
    : hour
      ? {
          observedAt: null,
          speed: hour.windSpeedMetersPerSecond,
          gust: null,
          direction: hour.windDirectionDegrees,
        }
      : null;
  return {
    alertId: at.alertId,
    notificationId: at.notificationId,
    start: at.window.start.toISOString(),
    end: at.window.end.toISOString(),
    more: at.more,
    pauseUntil: endOfToday(now, at.settings).toISOString(),
    sea: hour
      ? {
          at: hour.at.toISOString(),
          heightMeters: tenths(hour.waveHeightMeters),
          periodSeconds: whole(hour.wavePeakPeriodSeconds),
          directionDegrees: whole(hour.waveDirectionDegrees),
        }
      : null,
    wind: blows && {
      observedAt: blows.observedAt,
      speedMetersPerSecond: tenths(blows.speed),
      gustMetersPerSecond: tenths(blows.gust),
      directionDegrees: whole(blows.direction),
      atShore:
        blows.direction !== null && offshore !== null ? shoreWind(blows.direction, offshore) : null,
    },
    tide: tide
      ? {
          type: tide.type,
          time: toMinute(tide.time).toISOString(),
          heightMeters: Math.round(tide.heightMeters * 10) / 10,
        }
      : null,
    buoy: buoy && {
      observedAt: buoy.observedAt,
      heightMeters: tenths(buoy.significantHeightMeters),
      periodSeconds: whole(buoy.peakPeriodSeconds),
      directionDegrees: whole(buoy.peakDirectionDegrees),
    },
  };
}

/**
 * Why an activity ends, as a run counts it. `system` is one that iOS has taken off the phone
 * already, which is sent nothing.
 */
type EndOf = "over" | "gone" | "alert" | "account" | "device" | "system";

/** A running activity, as its row and its iPhone hold it. */
type Running = typeof liveActivity.$inferSelect;
type Device = typeof pushSubscription.$inferSelect;

/**
 * What a running activity shows now, and until when its window lasts, or why it ends. `also`
 * are places of its alert that a beginning on its way counts as on, before what it told is
 * written: `handBy` gives those it tells.
 *
 * It ends when its window is over, or gone by the last look: none of its hours is found by a
 * look that is fresh, and no hours told of it still stand, which two looks that miss them call
 * off (decision 031). It ends when its alert was switched off, changed or deleted, or paused for
 * the day; when its account is suspended or away; and when its iPhone is no longer the account's
 * device that starts them: forgotten, with its session or its push, signed in to by another
 * account, or its switch turned off, which the API says by letting go of the activity. One that
 * iOS has taken off the phone itself, twelve hours after it started, ends with nothing sent.
 */
export async function followed(
  tx: Transaction,
  activity: Running,
  now: Date,
  also: readonly string[] = [],
): Promise<{ shown: WindowShown; until: Date; ends: EndOf | null }> {
  const [settingsRow] = await tx
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.userId, activity.userId));
  const settings = settingsOf(settingsRow);
  const [held] = activity.alertId
    ? await tx.select().from(alert).where(eq(alert.id, activity.alertId))
    : [];
  const links = held ? await watchedOf(tx, { alertId: held.id }) : [];
  // The place it shows, which its start told first: it may be another notification's, that
  // began with its own.
  const link = links.find((one) => one.place.id === activity.placeId);
  // The hours it shows: from where its window began there to where it lasts.
  const said = { start: activity.startsAt, end: activity.lastsUntil };
  // As the last look still finds them, when it is fresh: they may have moved.
  const found = link
    ? stillOpen(now, watched(link, now), openOf(links, availabilityOf(settings)), [said])
    : [];
  const window =
    found.length > 0
      ? {
          start: new Date(Math.min(...found.map((piece) => piece.start.getTime()))),
          end: new Date(Math.max(...found.map((piece) => piece.end.getTime()))),
        }
      : said;
  // Hours told of it that a look missed once still stand: a second miss calls them off.
  const standing = (link?.link.told ?? []).some(
    (piece) =>
      piece.missed < LOOKS_TO_CALL_OFF &&
      new Date(piece.start).getTime() < said.end.getTime() &&
      new Date(piece.end).getTime() > said.start.getTime(),
  );
  const isGone = link !== undefined && isFresh(link.link, now) && found.length === 0 && !standing;
  const isLater = (moment: Date | null) => moment !== null && moment.getTime() > now.getTime();
  const endOf = async (): Promise<EndOf | null> => {
    if (now.getTime() - activity.createdAt.getTime() >= IOS_SHOWS_MS) return "system";
    // Switched off, changed, deleted, its place taken out of it, or paused for the day.
    if (!held || !held.enabled || held.revision !== activity.alertRevision || !link) return "alert";
    if (isLater(held.awayUntil)) return "alert";
    if (isLater(settings.awayUntil) || (await isSuspended(tx, activity.userId))) return "account";
    if (activity.deviceId === null) return "device";
    if (window.end.getTime() <= now.getTime()) return "over";
    return isGone ? "gone" : null;
  };
  const ends = await endOf();
  // The alert's other places that are on with it: what push said to begin there and is not over.
  const others = links.filter(
    (one) =>
      one.place.id !== link?.place.id &&
      (also.includes(one.place.id) || running(one.link.pushBegun, now).length > 0),
  );
  const shown = await windowShown(
    tx,
    {
      alertId: held?.id ?? activity.alertId ?? "",
      notificationId: activity.notificationId,
      place: link?.place ?? null,
      windows: link?.windows ?? [],
      window,
      more: others.length,
      settings,
    },
    now,
  );
  return { shown, until: window.end, ends };
}

/**
 * What a start of the activity shows, which the first step of "it is on" wrote: the place it
 * shows, where its window there begins, and until when it lasts.
 */
export type Beginning = { shown: WindowShown; placeId: string; startsAt: Date; until: Date };

// An iPhone whose switch is on: it gave the token that starts its Live Activities.
type SwitchedOn = Device & {
  activityStartToken: string;
  appId: string;
  environment: NonNullable<Device["environment"]>;
};
const switchedOn = (device: Device): device is SwitchedOn =>
  device.kind === "ios" &&
  device.activityStartToken !== null &&
  device.appId !== null &&
  device.environment !== null;

/**
 * Whether an account has an iPhone whose switch for Live Activities is on: the first step of "it
 * is on" then writes what a start would show.
 */
export async function hasSwitchOn(tx: Transaction, userId: string) {
  const [one] = await tx
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, userId),
        eq(pushSubscription.kind, "ios"),
        isNotNull(pushSubscription.activityStartToken),
      ),
    )
    .limit(1);
  return one !== undefined;
}

/**
 * Hands "it is on" over to every device of an account, in the second step of its push (`handBy`
 * in `deliveries.ts`), while the account, its alert, its settings and its devices are held: on
 * an iPhone whose switch is on, as the Live Activity of its window, and as the push of decision
 * 072 everywhere else. A beginning of the alert while an activity of it runs on the iPhone
 * updates that one, the alert's as it is now and the latest first, and lights the screen, and
 * starts no second one. A notification starts one activity on an iPhone: its later hours, once
 * that one has run, leave as the push. When APNs refuses the start or the update, the push
 * leaves to that iPhone in its
 * place, and a token that starts no more activities is let go of. When APNs takes it, nothing
 * says whether the system showed it.
 *
 * Says what became of the push at each device, as `pushToAll` does: a start or an update that
 * Apple took, or that may have left, is the device's. `write` then writes the rows of
 * `live_activity` in the same transaction, after the devices, and once those that are gone are
 * forgotten.
 */
export async function beginOn(
  tx: Transaction,
  ios: ApnsPusher,
  devices: readonly Device[],
  pushOne: (device: Device) => Promise<Outcome> | null,
  begins: {
    userId: string;
    alertId: string;
    revision: number;
    notificationId: string;
    locale: Locale;
    keepSeconds: number;
    // What a start shows. Null when no iPhone of the account had its switch on as the push was
    // written: an iPhone that switched it on since is pushed to.
    beginning: Beginning | null;
    // The places this beginning tells.
    places: readonly string[];
  },
  now: Date,
) {
  const iphones = devices.filter(switchedOn);
  // The activities of the alert that run on them, and those this notification started, held
  // after the devices. One that iOS ended, eight hours after it started, runs no more.
  const runsSince = new Date(now.getTime() - IOS_RUNS_MS);
  const isRunning = (one: Running) =>
    one.alertId === begins.alertId &&
    one.endedAt === null &&
    one.lastsUntil.getTime() > now.getTime() &&
    one.createdAt.getTime() > runsSince.getTime();
  const rows =
    iphones.length === 0
      ? []
      : await tx
          .select()
          .from(liveActivity)
          .where(
            and(
              inArray(
                liveActivity.deviceId,
                iphones.map((device) => device.id),
              ),
              or(
                and(
                  eq(liveActivity.alertId, begins.alertId),
                  isNull(liveActivity.endedAt),
                  gt(liveActivity.lastsUntil, now),
                  gt(liveActivity.createdAt, runsSince),
                ),
                eq(liveActivity.notificationId, begins.notificationId),
              ),
            ),
          )
          .orderBy(asc(liveActivity.id))
          .for("update");
  // Of those that run, the alert's as it is now first, then the latest: an older one is ended by
  // the job that follows them.
  const isCurrent = (one: Running) => Number(one.alertRevision === begins.revision);
  const runs = rows
    .filter(isRunning)
    .sort((a, b) => isCurrent(b) - isCurrent(a) || b.createdAt.getTime() - a.createdAt.getTime());
  type Plan =
    | { kind: "push"; device: Device }
    | { kind: "start"; device: SwitchedOn; beginning: Beginning }
    | {
        kind: "update";
        device: Device;
        run: Running & { token: string };
        shown: WindowShown;
        until: Date;
      };
  // What is read of the database is read before anything leaves.
  const plans: Plan[] = [];
  for (const device of devices) {
    if (!switchedOn(device)) {
      plans.push({ kind: "push", device });
      continue;
    }
    const run = runs.find((one) => one.deviceId === device.id);
    const next = run && (await followed(tx, run, now, begins.places));
    if (run && next && !next.ends) {
      // An activity whose token has not come cannot be updated: the push tells it.
      plans.push(
        run.token
          ? { kind: "update", device, run: { ...run, token: run.token }, ...next }
          : { kind: "push", device },
      );
    } else if (
      rows.some((one) => one.deviceId === device.id && one.notificationId === begins.notificationId)
    ) {
      // This notification started one there already, which ran: its later hours leave as the
      // push, since the app names an activity by its iPhone and its notification.
      plans.push({ kind: "push", device });
    } else if (begins.beginning) {
      // An activity that ran and should end is ended by the job that follows them.
      plans.push({ kind: "start", device, beginning: begins.beginning });
    } else {
      plans.push({ kind: "push", device });
    }
  }

  const sent = await Promise.allSettled(
    plans.map(async (plan) => {
      const { device } = plan;
      const pushed = async () => {
        const sending = pushOne(device);
        return sending ? await sending : null;
      };
      if (plan.kind === "push") return { plan, outcome: await pushed(), activity: null };
      // A start goes to the iPhone, and an update to its activity, through what it kept.
      const to =
        plan.kind === "start"
          ? {
              token: plan.device.activityStartToken,
              appId: plan.device.appId,
              environment: plan.device.environment,
            }
          : { token: plan.run.token, appId: plan.run.appId, environment: plan.run.environment };
      const activity = await ios.activity(
        to,
        plan.kind === "start"
          ? {
              event: "start",
              shown: plan.beginning.shown,
              staleAt: plan.beginning.until,
              locale: begins.locale,
              url: ACTIVITY_URL,
            }
          : { event: "update", shown: plan.shown, staleAt: plan.until, locale: begins.locale },
        begins.keepSeconds,
      );
      if (activity === "taken" || activity === "failed") {
        return { plan, outcome: activity as Outcome | null, activity };
      }
      // Refused, or no more: the push of decision 072 leaves to the iPhone in its place.
      return { plan, outcome: await pushed(), activity };
    }),
  );
  const done = sent.map((one) => {
    if (one.status === "rejected") throw one.reason;
    return one.value;
  });

  return {
    results: done.flatMap(({ plan, outcome }) =>
      outcome === null ? [] : [{ device: plan.device, outcome }],
    ),
    // What it wrote of the activities, once the devices that are gone are forgotten.
    write: async (forgotten: readonly string[]) => {
      for (const { plan, activity } of done) {
        if (plan.kind === "push" || forgotten.includes(plan.device.id)) continue;
        const isSent = activity === "taken" || activity === "failed";
        if (plan.kind === "start" && isSent) {
          await tx
            .insert(liveActivity)
            .values({
              id: crypto.randomUUID(),
              // By the worker's clock, which the job counts how long iOS shows it by.
              createdAt: now,
              userId: begins.userId,
              deviceId: plan.device.id,
              environment: plan.device.environment,
              appId: plan.device.appId,
              notificationId: begins.notificationId,
              alertId: begins.alertId,
              alertRevision: begins.revision,
              placeId: plan.beginning.placeId,
              startsAt: plan.beginning.startsAt,
              lastsUntil: plan.beginning.until,
              shown: shownHash(plan.beginning.shown),
            })
            .onConflictDoNothing();
        } else if (plan.kind === "start" && activity === "gone") {
          // The token starts no more activities: the app gives another when iOS does. The
          // activities that run on the iPhone go on: its switch was not turned off.
          await tx
            .update(pushSubscription)
            .set({ activityStartToken: null })
            .where(eq(pushSubscription.id, plan.device.id));
        } else if (plan.kind === "update" && isSent) {
          await tx
            .update(liveActivity)
            .set({ shown: shownHash(plan.shown), lastsUntil: plan.until })
            .where(eq(liveActivity.id, plan.run.id));
        } else if (plan.kind === "update" && activity === "gone") {
          await tx
            .update(liveActivity)
            .set({ endedAt: now, token: null })
            .where(eq(liveActivity.id, plan.run.id));
        }
      }
    },
  };
}

/** What a run of the job did, as the worker says it of a job: decision 022. */
export type Followed = { running: number; updated: number; ended: number; failed: number };

export function activitiesDone({ running, updated, ended, failed }: Followed) {
  return { counts: { running, updated, ended, failed }, degraded: failed > 0 };
}

/**
 * Follows one running activity, holding its account, its iPhone and the activity, in the order
 * the API holds them: the app that gives its token, or says it ended, waits for what leaves.
 */
async function followOne(db: Database, ios: ApnsPusher | null, id: string) {
  return db.transaction(async (tx): Promise<"updated" | "ended" | "kept" | "failed"> => {
    const [row] = await tx
      .select({ userId: liveActivity.userId, deviceId: liveActivity.deviceId })
      .from(liveActivity)
      .where(eq(liveActivity.id, id));
    if (!row) return "kept";
    await tx.select({ id: user.id }).from(user).where(eq(user.id, row.userId)).for("share");
    // Its iPhone, while it is the account's device that starts them.
    if (row.deviceId) {
      await tx
        .select({ id: pushSubscription.id })
        .from(pushSubscription)
        .where(eq(pushSubscription.id, row.deviceId))
        .for("update");
    }
    const [activity] = await tx
      .select()
      .from(liveActivity)
      .where(and(eq(liveActivity.id, id), isNull(liveActivity.endedAt)))
      .for("update");
    // Ended meanwhile by the app, or forgotten with its account.
    if (!activity) return "kept";
    const now = new Date();
    const { shown, until, ends } = await followed(tx, activity, now);
    // Reached through what it kept of its iPhone, which may be gone.
    const to = activity.token && {
      token: activity.token,
      appId: activity.appId,
      environment: activity.environment,
    };

    if (ends) {
      // It leaves the screen at once: its window, or what it was of, is no more. An end that
      // Apple did not take, or may not have, is sent again at the next run, until iOS has taken
      // the activity off the phone itself: two ends do no harm.
      if (to && ios && ends !== "system") {
        const outcome = await ios.activity(
          to,
          { event: "end", shown, dismissAt: now },
          END_KEPT_SECONDS,
        );
        if (outcome === "refused" || outcome === "failed") return "failed";
      }
      await tx
        .update(liveActivity)
        .set({ endedAt: now, token: null })
        .where(eq(liveActivity.id, activity.id));
      return "ended";
    }
    const hash = shownHash(shown);
    // Nothing changed of what it shows, or it cannot be reached yet: its token has not come.
    if (hash === activity.shown || !to || !ios) {
      if (until.getTime() !== activity.lastsUntil.getTime()) {
        await tx
          .update(liveActivity)
          .set({ lastsUntil: until })
          .where(eq(liveActivity.id, activity.id));
      }
      return "kept";
    }
    const outcome: Outcome = await ios.activity(
      to,
      { event: "update", shown, staleAt: until },
      (until.getTime() - now.getTime()) / 1000,
    );
    // Apple says the activity is no more on the phone: it was dismissed, or ended there.
    if (outcome === "gone") {
      await tx
        .update(liveActivity)
        .set({ endedAt: now, token: null })
        .where(eq(liveActivity.id, activity.id));
      return "ended";
    }
    // Refused, it is tried again at the next run. Failed, it may have left.
    if (outcome === "refused") return "failed";
    await tx
      .update(liveActivity)
      .set({ shown: hash, lastsUntil: until })
      .where(eq(liveActivity.id, activity.id));
    return outcome === "taken" ? "updated" : "failed";
  });
}

/**
 * Updates the Live Activities that run, when what they show has changed, and ends those that
 * should end, each in a transaction of its own: one that fails does not stop the others. Then it
 * forgets those that ended a day ago. It sends nothing while no activity runs, and nothing on an
 * instance whose worker holds no key of Apple's: it ends what should end there all the same. The
 * log holds counts and kinds of failures, and never a token.
 */
export const followActivities = Effect.fn("followActivities")(function* (
  db: Database,
  ios: ApnsPusher | null,
) {
  const store = <Value>(read: () => Promise<Value>) =>
    Effect.tryPromise({
      try: read,
      catch: (cause) => new StoreError({ provider: "alerts", cause }),
    });
  const counts: Followed = { running: 0, updated: 0, ended: 0, failed: 0 };
  const runningIds = yield* store(() =>
    db
      .select({ id: liveActivity.id })
      .from(liveActivity)
      .where(isNull(liveActivity.endedAt))
      .orderBy(asc(liveActivity.createdAt), asc(liveActivity.id)),
  );
  const began = Date.now();
  for (const { id } of runningIds) {
    if (Date.now() - began > FOLLOWED_FOR_MS) break;
    const result = yield* Effect.result(store(() => followOne(db, ios, id)));
    if (Result.isFailure(result)) {
      counts.failed += 1;
      yield* Effect.logWarning(`activities: one could not be followed (${result.failure._tag})`);
      continue;
    }
    if (result.success === "updated") counts.updated += 1;
    if (result.success === "ended") counts.ended += 1;
    if (result.success === "failed") counts.failed += 1;
    if (result.success !== "ended") counts.running += 1;
  }
  yield* store(() =>
    db.delete(liveActivity).where(lt(liveActivity.endedAt, new Date(Date.now() - ENDED_KEPT_MS))),
  );
  if (runningIds.length > 0) {
    yield* Effect.logInfo(
      `activities: ${counts.running} running, ${counts.updated} updated, ${counts.ended} ended, ${counts.failed} failed`,
    );
  }
  return counts;
});
