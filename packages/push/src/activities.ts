import { WINDOW_ACTIVITY } from "@repo/config/activities";
import type { Locale } from "@repo/mail/verification";

// The name of the activity of a window that begins, which the app reads there too.
export { WINDOW_ACTIVITY };

// The Live Activity that "it is on" starts on an iPhone whose switch is on, in the place of its
// push: decision 074. Apple's pushes start it, update it and end it, and the system draws what
// they carry: no extension of the app reads them first, so Apple reads them, where it reads
// nothing of an alert's push (decision 072). What they carry is figures, times and two ids, and
// never a name: not the alert's, not the place's, and no id of a break or a station, whose names
// anyone reads from them.
//
// The shape is expo-widgets', which draws the activity in the app, as its version 58.0.21 reads
// it in `apps/native/node_modules/expo-widgets`:
//
// - `ios/Widgets/WidgetLiveActivity.swift` declares the attributes of every activity the library
//   draws: `struct LiveActivityAttributes: ActivityAttributes { var url: String? }`, whose
//   `ContentState` is `{ var name: String; var props: String? }`. A push that starts one names
//   that type as its `attributes-type`, gives `{ "url": … }` as its `attributes`, and gives the
//   content as `{ "name": …, "props": … }`: the name of the activity, and its properties as a
//   string of JSON, not as an object.
// - `ios/LiveActivityFactory.swift` starts one with `ContentState(name: name, props: props)`,
//   where `name` is what the app gave `createLiveActivity`, and `getInstances` keeps those whose
//   `content.state.name` is that name: the app finds the activity a push started by its name.
// - `src/Widgets.ts` writes `props` with `JSON.stringify`, and `ios/Widgets/Utils.swift`
//   (`getLiveActivityNodes`) reads it back as a JSON object, which it gives the layout the app
//   stored under `__expo_widgets_live_activity_<name>_layout` as it made its factory.
// - `ios/WidgetsModule.swift` gives the app the token that starts one, `pushToStartToken` and its
//   updates, and `ios/LiveActivity.swift` the token of each activity, `pushTokenUpdates`: both in
//   hexadecimal, as the token of a device is.
//
// What a push holds beside, Apple's own keys, is from "Starting and updating Live Activities with
// ActivityKit push notifications": `timestamp` and `event` always, `attributes-type`,
// `attributes` and an `alert` to start one, `input-push-token: 1` so that iOS 18 gives the
// activity a token of its own, `stale-date` when it is stale, and `dismissal-date` with its end,
// which an end alone takes. A start sets no end: the worker ends the activity, and iOS ends any
// after eight hours.

/** The type of the attributes expo-widgets declares for every activity it draws. */
export const ACTIVITY_ATTRIBUTES_TYPE = "LiveActivityAttributes";

/**
 * What the activity of a window that begins shows, as the app's layout reads it: the figures in
 * the units of the API, metres, seconds, metres a second and degrees that the sea or the wind
 * comes from, and the times in ISO 8601. The layout writes them in the account's units and
 * language, which the app keeps on the phone, as it writes the alert's name from what the app
 * wrote there under the alert's id. A part that is null was not measured or is not known.
 */
export type WindowShown = {
  // The alert and the notification of "it is on" that started the activity, which name nothing
  // to whoever does not hold the account.
  alertId: string;
  notificationId: string;
  // The window at the first place that began: when its hours began, and until when they last.
  start: string;
  end: string;
  // How many more of the alert's places are on with it.
  more: number;
  // The end of the account's day, which "Not today" gives `alerts.pauseToday`: decision 072.
  pauseUntil: string;
  // What the forecast gives for the hour now, as the last look read it.
  sea: {
    at: string;
    heightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
  } | null;
  // The wind the nearest station measured lately, or the forecast's for the hour when none did,
  // which `observedAt` then leaves null, and how it meets the shore where the place knows its
  // offshore direction: "offshore", "cross_offshore", "cross_shore", "cross_onshore" or
  // "onshore".
  wind: {
    observedAt: string | null;
    speedMetersPerSecond: number | null;
    gustMetersPerSecond: number | null;
    directionDegrees: number | null;
    atShore: string | null;
  } | null;
  // The next high or low.
  tide: { type: "high" | "low"; time: string; heightMeters: number } | null;
  // The latest reading of the nearest buoy, whose age the layout counts from `observedAt`.
  buoy: {
    observedAt: string;
    heightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
  } | null;
};

/**
 * A push of the activity: the start, to the token that starts one, with the line it lights the
 * screen with in the account's language and the address a press opens; an update, which lights
 * the screen too when it tells a beginning (`locale`) and otherwise leaves at the low priority
 * Apple keeps for updates; and its end, which takes it off the screen at `dismissAt`.
 */
export type ActivityPush =
  | { event: "start"; shown: WindowShown; staleAt: Date; locale: Locale; url?: string }
  | { event: "update"; shown: WindowShown; staleAt: Date; locale?: Locale }
  | { event: "end"; shown: WindowShown; dismissAt: Date };

/**
 * The line a start lights the screen with, and an update that tells a beginning: the app's own,
 * in the account's language, which says no name. The alert's name is the layout's to show, from
 * what the app keeps on the phone.
 */
export const ACTIVITY_ALERT: Record<Locale, { title: string; body: string }> = {
  en: { title: "It is on", body: "A window of one of your alerts begins" },
  fr: { title: "C’est le moment", body: "Un créneau d’une de tes alertes commence" },
  es: { title: "Es el momento", body: "Empieza una ventana de una de tus alertas" },
  pt: { title: "É agora", body: "Começa uma janela de um dos teus alertas" },
};

const seconds = (moment: Date) => Math.floor(moment.getTime() / 1000);

/** What Apple is given for a push of the activity, written at `now`. */
export function activityPayload(push: ActivityPush, now: Date) {
  const lights = push.event === "end" ? undefined : push.locale;
  const alert = lights ? (ACTIVITY_ALERT[lights] ?? ACTIVITY_ALERT.en) : undefined;
  return {
    aps: {
      // The latest of what Apple was given is what the phone shows.
      timestamp: seconds(now),
      event: push.event,
      "content-state": { name: WINDOW_ACTIVITY, props: JSON.stringify(push.shown) },
      ...(push.event === "end"
        ? { "dismissal-date": seconds(push.dismissAt) }
        : { "stale-date": seconds(push.staleAt) }),
      ...(push.event === "start"
        ? {
            "attributes-type": ACTIVITY_ATTRIBUTES_TYPE,
            attributes: push.url ? { url: push.url } : {},
            // So that iOS 18 gives the activity a token, which the app gives the API.
            "input-push-token": 1,
          }
        : {}),
      ...(alert ? { alert: { ...alert, sound: "default" } } : {}),
    },
  };
}
