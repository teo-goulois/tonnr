import { APP_SCHEME } from "@repo/config/app";

// The Live Activity of a window that begins, on an iPhone whose switch is on: decision 074, "When
// a window begins, on an iPhone". Apple's pushes start it, update it and end it, and the system
// draws what they carry with the layout the app gave expo-widgets: no code of the app runs then.
// So the layout reads what a push carries, figures in the API's units, times and two ids, with
// what the app wrote beside it as it made the layout: the alert's name and its place's, keyed by
// the alert's id, the account's units, and the words in the app's language. That is what
// `WindowKept` holds, and the app writes it inside the layout, which expo-widgets keeps in the
// space the app shares with its extensions, `group.app.tonnr`: the widget's runtime reads no
// other storage.
//
// `readWindow` runs in that runtime, as the layout does: it is marked `widget`, so that the build
// writes it out as a string, and it may name nothing outside itself, nor use what the build would
// write with a helper of its own (a spread, a destructuring, `for…of`). A test runs it as it is.

/**
 * The name of the activity, which the worker's pushes give its content and expo-widgets finds
 * its layout by: `WINDOW_ACTIVITY` in `packages/push/src/activities.ts`.
 */
export const WINDOW_ACTIVITY = "window-begins";

/**
 * What the worker's pushes carry, `WindowShown` in `packages/push/src/activities.ts`, which the
 * app cannot import: figures in metres, seconds, metres a second and degrees the sea or the wind
 * comes from, times in ISO 8601, and null for what was not measured or is not known.
 */
export type WindowShown = {
  alertId: string;
  notificationId: string;
  start: string;
  end: string;
  more: number;
  pauseUntil: string;
  sea: {
    at: string;
    heightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
  } | null;
  wind: {
    observedAt: string | null;
    speedMetersPerSecond: number | null;
    gustMetersPerSecond: number | null;
    directionDegrees: number | null;
    atShore: string | null;
  } | null;
  tide: { type: "high" | "low"; time: string; heightMeters: number } | null;
  buoy: {
    observedAt: string;
    heightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
  } | null;
};

/** What the app writes beside the layout: names, units and words. */
export type WindowKept = {
  // The account's alerts by their id: the alert's name, and for an alert on one place that
  // place's name and how a route names it, `break:<id>` or `spot:<id>`.
  alerts: Record<string, { name: string; place: string | null; at: string | null }>;
  units: {
    // How many of the account's unit one metre a second and one metre are, and their names.
    windPerMs: number;
    wind: string;
    heightPerM: number;
    height: string;
    period: string;
    // What the app's language writes between a figure's units and its tenths.
    decimal: string;
  };
  words: {
    high: string;
    low: string;
    buoy: string;
    gusts: string;
    until: string;
    moreOne: string;
    // With `{count}` where the number goes.
    more: string;
    notToday: string;
    logSession: string;
    // The sixteen points of the compass, from the north, as the app writes a bearing.
    compass: string[];
    // How the wind meets the shore, by the worker's word for it.
    shore: Record<string, string>;
  };
  scheme: string;
};

/** What the activity writes of a push, each part null when the push says nothing of it. */
export type WindowRead = {
  title: string | null;
  place: string | null;
  more: string | null;
  sea: string | null;
  // The height alone, where there is room for one figure.
  height: string | null;
  // Where the sea goes, in degrees: the arrow turns by it.
  seaToward: number | null;
  wind: string | null;
  tide: { word: string; at: number; height: string | null } | null;
  buoy: { text: string; at: number } | null;
  start: number;
  end: number;
  session: string;
  pause: string;
};

/** What the activity of a window writes, from a push and from what the app wrote beside it. */
export function readWindow(shown: WindowShown, kept: WindowKept): WindowRead {
  "widget";
  const units = kept.units;
  const words = kept.words;
  function figure(value: number, digits: number) {
    const power = Math.pow(10, digits);
    return (Math.round(value * power) / power).toFixed(digits).replace(".", units.decimal);
  }
  function height(meters: number | null) {
    return meters === null ? null : `${figure(meters * units.heightPerM, 1)} ${units.height}`;
  }
  function period(seconds: number | null) {
    return seconds === null ? null : `${figure(seconds, 0)} ${units.period}`;
  }
  function speed(metersPerSecond: number | null) {
    return metersPerSecond === null ? null : figure(metersPerSecond * units.windPerMs, 0);
  }
  function compass(degrees: number | null) {
    if (degrees === null || words.compass.length === 0) return null;
    const step = 360 / words.compass.length;
    const index = Math.round((((degrees % 360) + 360) % 360) / step) % words.compass.length;
    return words.compass[index] ?? null;
  }
  // The parts that are known, between dots.
  function joined(parts: (string | null)[]) {
    const known = parts.filter((part) => part !== null && part !== "");
    return known.length > 0 ? known.join(" · ") : null;
  }
  function sea(at: { heightMeters: number | null; periodSeconds: number | null }) {
    return joined([height(at.heightMeters), period(at.periodSeconds)]);
  }

  const alert = kept.alerts[shown.alertId] ?? null;
  const wind = shown.wind;
  let blows: string | null = null;
  if (wind) {
    const strength = speed(wind.speedMetersPerSecond);
    const gust = speed(wind.gustMetersPerSecond);
    blows = joined([
      strength === null ? null : `${strength} ${units.wind}`,
      compass(wind.directionDegrees),
      gust === null ? null : words.gusts.replace("{speed}", `${gust} ${units.wind}`),
      wind.atShore === null ? null : (words.shore[wind.atShore] ?? null),
    ]);
  }
  const tide = shown.tide;
  const buoy = shown.buoy;
  const buoySea = buoy ? sea(buoy) : null;
  const toward = shown.sea ? shown.sea.directionDegrees : null;
  return {
    title: alert ? alert.name : null,
    place: alert ? alert.place : null,
    more:
      shown.more > 0
        ? shown.more === 1
          ? words.moreOne
          : words.more.replace("{count}", String(shown.more))
        : null,
    sea: shown.sea ? sea(shown.sea) : null,
    height: shown.sea ? height(shown.sea.heightMeters) : null,
    seaToward: toward === null ? null : (toward + 180) % 360,
    wind: blows,
    tide: tide
      ? {
          word: tide.type === "high" ? words.high : words.low,
          at: Date.parse(tide.time),
          height: height(tide.heightMeters),
        }
      : null,
    buoy:
      buoy && buoySea !== null
        ? { text: `${words.buoy} ${buoySea}`, at: Date.parse(buoy.observedAt) }
        : null,
    start: Date.parse(shown.start),
    end: Date.parse(shown.end),
    session:
      alert && alert.at
        ? `${kept.scheme}://session/new?place=${encodeURIComponent(alert.at)}`
        : `${kept.scheme}://session/new`,
    pause: `${kept.scheme}://pause-alert?alert=${encodeURIComponent(shown.alertId)}&until=${encodeURIComponent(shown.pauseUntil)}`,
  };
}

/** An alert as the app keeps its name for the activity. */
type NamedAlert = {
  id: string;
  name: string;
  places: { spotId: string | null; breakId: string | null; name: string }[];
};

/** What the app writes beside the layout, from the account's alerts and the app's own writing. */
export function keptForWindow(
  alerts: readonly NamedAlert[],
  writing: {
    windPerMs: number;
    wind: string;
    heightPerM: number;
    height: string;
    period: string;
    decimal: string;
    words: Omit<WindowKept["words"], "compass"> & { compass: string };
  },
): WindowKept {
  const named: WindowKept["alerts"] = {};
  for (const alert of alerts) {
    const [only] = alert.places.length === 1 ? alert.places : [];
    const at = only?.breakId
      ? `break:${only.breakId}`
      : only?.spotId
        ? `spot:${only.spotId}`
        : null;
    named[alert.id] = { name: alert.name, place: only?.name ?? null, at };
  }
  const { words, ...units } = writing;
  return {
    alerts: named,
    units,
    words: { ...words, compass: words.compass.split(",") },
    scheme: APP_SCHEME,
  };
}

/**
 * A function the build wrote out as a string, as the widget's runtime reads it: what a test runs
 * is still a function, which is written out here.
 */
export const sourceOf = (written: unknown) =>
  typeof written === "string" ? written : String(written);

/**
 * The layout of the activity as expo-widgets keeps it: a function of the push's properties and of
 * the system's environment, which gives the layout that was written, `layout`, the reading of the
 * push and what the app wrote beside it. Both functions were written out by the build.
 */
export function layoutWith(layout: unknown, read: unknown, kept: WindowKept) {
  return `function(props,environment){return (${sourceOf(layout)})(props,environment,(${sourceOf(read)}),${JSON.stringify(kept)});}`;
}
