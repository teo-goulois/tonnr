import { APP_SCHEME } from "@repo/config/app";
import type { WindowShown } from "@repo/push/activities";

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
 * What the worker's pushes carry, `WindowShown` of `packages/push/src/activities.ts`, read as a
 * type: figures in metres, seconds, metres a second and degrees the sea or the wind comes from,
 * times in ISO 8601, and null for what was not measured or is not known.
 */
export type { WindowShown };

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
    // The sixteen points of the compass, from the north, as the app writes a bearing, and their
    // whole names, as a screen reader says them after `from`.
    compass: string[];
    names: string[];
    from: string;
    // How the wind meets the shore, by the worker's word for it.
    shore: Record<string, string>;
    // What a screen reader says of the bar that fills as the window goes by, and of the waves
    // drawn where the alert's name is not known.
    progress: string;
    label: string;
  };
  scheme: string;
};

/**
 * Where the sea or the wind comes from, as everywhere in the app: an arrow toward where it goes,
 * turned by `toward` in degrees, then the point it comes from, and what a screen reader says.
 */
export type WindowDirection = { toward: number; point: string; spoken: string };

/** What the activity writes of a push, each part null when the push says nothing of it. */
export type WindowRead = {
  title: string | null;
  place: string | null;
  more: string | null;
  // "1,8 m · 12 s", and where the sea comes from.
  sea: string | null;
  seaFrom: WindowDirection | null;
  // The height alone, where there is room for one figure.
  height: string | null;
  // "10 kn", where it comes from, then "· rafales 15 kn · offshore", and the line as it is said.
  wind: {
    speed: string | null;
    from: WindowDirection | null;
    rest: string | null;
    spoken: string;
  } | null;
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
  function direction(degrees: number | null): WindowDirection | null {
    if (degrees === null || words.compass.length === 0) return null;
    const around = ((degrees % 360) + 360) % 360;
    const index = Math.round(around / (360 / words.compass.length)) % words.compass.length;
    const point = words.compass[index];
    if (point === undefined) return null;
    const name = words.names[index] ?? point;
    return { toward: (around + 180) % 360, point: point, spoken: `${words.from} ${name}` };
  }
  // The parts that are known, between `between`.
  function joined(parts: (string | null)[], between: string) {
    const known = parts.filter((part) => part !== null && part !== "");
    return known.length > 0 ? known.join(between) : null;
  }
  function sea(at: { heightMeters: number | null; periodSeconds: number | null }) {
    return joined([height(at.heightMeters), period(at.periodSeconds)], " · ");
  }

  const alert = kept.alerts[shown.alertId] ?? null;
  const wind = shown.wind;
  let blows: WindowRead["wind"] = null;
  if (wind) {
    const strength = speed(wind.speedMetersPerSecond);
    const gust = speed(wind.gustMetersPerSecond);
    const force = strength === null ? null : `${strength} ${units.wind}`;
    const from = direction(wind.directionDegrees);
    const gusts = gust === null ? null : words.gusts.replace("{speed}", `${gust} ${units.wind}`);
    const shore = wind.atShore === null ? null : (words.shore[wind.atShore] ?? null);
    const rest = joined([gusts, shore], " · ");
    const spoken = joined([force, from === null ? null : from.spoken, gusts, shore], ", ");
    if (spoken !== null) {
      blows = {
        speed: force,
        from: from,
        rest: rest === null ? null : force === null && from === null ? rest : `· ${rest}`,
        spoken: spoken,
      };
    }
  }
  const tide = shown.tide;
  const buoy = shown.buoy;
  const buoySea = buoy ? sea(buoy) : null;
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
    seaFrom: shown.sea ? direction(shown.sea.directionDegrees) : null,
    height: shown.sea ? height(shown.sea.heightMeters) : null,
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
    // The points and their names as the messages hold them, between commas.
    words: Omit<WindowKept["words"], "compass" | "names"> & { compass: string; names: string };
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
    words: { ...words, compass: words.compass.split(","), names: words.names.split(",") },
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
