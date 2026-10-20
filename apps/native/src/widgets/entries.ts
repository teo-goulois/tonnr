import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor, scaleInk } from "@repo/client/sea-scales";
import type { SavedList } from "@repo/client/viewer/types";
import { APP_NAME, APP_SCHEME } from "@repo/config/app";
import type { WidgetConfigurationEnum } from "expo-widgets";

import { refsOf } from "@/components/lists/items";
import { goingTo } from "@/components/map/features";
import { kindWord, shoreWord } from "@/components/saved/place-words";
import {
  chunksOf,
  keyOf,
  type PlaceRef,
  type PlacesNow,
  type SeaFigures,
  type SeaNow,
  seaFiguresOf,
} from "@/components/saved/sea-now";
import {
  STALE_MS,
  compassPoint,
  formatClock,
  formatDayAndClock,
  formatSeconds,
  toKnots,
} from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { dark, light } from "@/theme/tokens";

import { FIRST_FAVORITE, WIDGET, type WidgetName } from "./names";
import type {
  WidgetFigures,
  WidgetHour,
  WidgetNotice,
  WidgetPalette,
  WidgetPill,
  WidgetPlace,
  WidgetProps,
  WidgetView,
} from "./props";

// What each widget shows, entry by entry, from one answer of `places.now`: decision 074. The app
// writes an entry as the widget shows it, in the account's units and the app's language, colored
// from the sea's scales. On iOS a widget has a timeline, an entry for each hour of the forecast
// that is kept, and a last one once nothing is left to show, which asks for the app to be opened.
// A module that reads no React and no phone, so that a test reads it.

const HOUR_MS = 60 * 60 * 1000;
/** How far ahead a timeline reaches: the hours `places.now` answers. */
export const HOURS_AHEAD = 48;
/** How many hours the widget of the next hours shows, the hour now among them. */
export const NEXT_HOURS = 5;
/** How many favourites the widget of the favourites shows, one on each line. */
export const FAVORITES_SHOWN = 3;

/** An entry of a widget's timeline: from `date` on, the widget shows `props`. */
export type WidgetEntry = { date: Date; props: WidgetProps };
export type WidgetTimelines = Record<WidgetName, WidgetEntry[]>;

/** The places the widgets read, and the favourites among them, the first first. */
export type WidgetPlaces = { places: PlaceRef[]; favorites: PlaceRef[] };

/**
 * The places the widgets read: the account's saved places, its favourites first and then its
 * other lists, each place once, as many as one call of `places.now` names. A widget whose place
 * is chosen offers these, and one that is not shows the first of the favourites.
 */
export function widgetPlaces(lists: readonly SavedList[]): WidgetPlaces {
  const favorites = lists.find((list) => list.isDefault);
  const ordered = [...(favorites ? [favorites] : []), ...lists.filter((list) => !list.isDefault)];
  return {
    places: chunksOf(ordered.flatMap(refsOf))[0] ?? [],
    favorites: favorites ? (chunksOf(refsOf(favorites), FAVORITES_SHOWN)[0] ?? []) : [],
  };
}

/** What a press opens: the place in the app, read by the parser of decision 073. */
export function placeUrl(ref: PlaceRef) {
  return `${APP_SCHEME}://app?${ref.kind}=${encodeURIComponent(ref.id)}`;
}

const SIGN_IN_URL = `${APP_SCHEME}://sign-in`;
const SAVED_URL = `${APP_SCHEME}://app?panel=saved`;

/** The theme's ground and ink, in each appearance: a widget follows the phone's. */
export const WIDGET_PALETTE: { light: WidgetPalette; dark: WidgetPalette } = {
  light: {
    ground: light["neutral-1"],
    ink: light["neutral-10"],
    muted: light["neutral-7"],
  },
  dark: {
    ground: dark["neutral-2"],
    ink: dark["neutral-10"],
    muted: dark["neutral-7"],
  },
};

function heightPill(meters: number): WidgetPill {
  return {
    label: formatHeight(meters),
    color: scaleColor(WAVE_HEIGHT_SCALE, meters),
    ink: scaleInk(WAVE_HEIGHT_SCALE, meters),
  };
}

function windPill(knots: number): WidgetPill {
  return {
    label: formatWind(knots),
    color: scaleColor(WIND_SPEED_SCALE, knots),
    ink: scaleInk(WIND_SPEED_SCALE, knots),
  };
}

const startOfHour = (at: number) => Math.floor(at / HOUR_MS) * HOUR_MS;

const sameDay = (one: Date, other: Date) => one.toDateString() === other.toDateString();

/** A moment as an entry of `at` says it: its time, and its day too when it is another day. */
function momentAt(moment: Date, at: Date) {
  return sameDay(moment, at) ? formatClock(moment) : formatDayAndClock(moment);
}

/** When the readings a place shows were measured: a station's own, else its nearest ones'. */
function readingTimes(sea: SeaNow): number[] {
  const own = (station: { id: string } | null) =>
    sea.place.kind !== "station" || station?.id === sea.place.id;
  return [
    own(sea.waves) ? sea.waves?.latestReading.observedAt : undefined,
    own(sea.wind) ? sea.wind?.latestReading.observedAt : undefined,
  ].flatMap((time) => (time ? [time.getTime()] : []));
}

function hasFigures(figures: SeaFigures) {
  return figures.heightMeters !== null || figures.windKnots !== null;
}

/**
 * Until when a place has figures to show that are no older than what they come from: the end of
 * the last hour of its kept forecast, else six hours after the oldest reading it shows, as a
 * reading is "none" after that. Null for a place that had nothing to show when it was asked.
 */
export function goodUntil(sea: SeaNow, at: Date): number | null {
  const figures = seaFiguresOf(sea, at);
  const last = sea.forecast?.hours.at(-1);
  if (figures.from === "forecast" && last) return last.time.getTime() + HOUR_MS;
  if (!hasFigures(figures)) return null;
  const times = readingTimes(sea);
  return times.length > 0 ? Math.min(...times) + STALE_MS : null;
}

function figuresOf(figures: SeaFigures, at: Date): WidgetFigures {
  const tide = figures.nextTide;
  return {
    ...(figures.heightMeters !== null && { height: heightPill(figures.heightMeters) }),
    ...(figures.periodSeconds !== null && { period: formatSeconds(figures.periodSeconds) }),
    ...(figures.wavesFromDegrees !== null && {
      wavesFrom: compassPoint(figures.wavesFromDegrees),
      wavesTo: goingTo(figures.wavesFromDegrees),
    }),
    ...(figures.windKnots !== null && { wind: windPill(figures.windKnots) }),
    ...(figures.atShore !== null && { shore: shoreWord(figures.atShore) }),
    ...(tide && {
      tide: `${tide.type === "high" ? m.page_tide_high() : m.page_tide_low()} ${momentAt(tide.time, at)}`,
    }),
  };
}

/** The hours ahead of `at` that the forecast keeps, and that are not past `until`. */
function hoursOf(sea: SeaNow, at: Date, until: number): WidgetHour[] {
  const hours = sea.forecast?.hours ?? [];
  return hours
    .filter((hour) => hour.time.getTime() >= at.getTime() && hour.time.getTime() < until)
    .slice(0, NEXT_HOURS)
    .map((hour) => {
      const knots = toKnots(hour.windSpeedMetersPerSecond);
      const period = hour.wavePeakPeriodSeconds ?? hour.wavePeriodSeconds;
      return {
        time: formatClock(hour.time),
        ...(hour.waveHeightMeters !== null && { height: heightPill(hour.waveHeightMeters) }),
        ...(period !== null && { period: formatSeconds(period) }),
        ...(knots !== null && { wind: windPill(knots) }),
      };
    });
}

/** A place as a widget shows it at `at`, until the timeline ends at `end`. */
function placeAt(
  sea: SeaNow,
  ref: PlaceRef,
  at: Date,
  end: number,
  withHours: boolean,
): WidgetPlace {
  const shown = { name: sea.place.name, url: placeUrl(ref) };
  const until = goodUntil(sea, at);
  const openApp = { ...shown, note: m.native_widget_open_app({ name: APP_NAME }) };
  if (until === null) {
    // Nothing was measured near it, nor kept of its forecast, when it was asked.
    return at.getTime() < end ? { ...shown, note: m.station_no_recent_reading() } : openApp;
  }
  if (at.getTime() >= until) return openApp;
  const figures = seaFiguresOf(sea, at);
  const forecast = sea.forecast;
  const note =
    figures.from === "forecast" && forecast
      ? m.native_widget_forecast_at({ time: momentAt(forecast.fetchedAt, at) })
      : m.native_widget_measured_at({
          time: momentAt(new Date(Math.min(...readingTimes(sea))), at),
        });
  const hours = withHours ? hoursOf(sea, at, until) : [];
  return {
    ...shown,
    figures: figuresOf(figures, at),
    note,
    ...(hours.length > 0 && { hours }),
  };
}

/** The sea of each place the widgets read, in their order: those the answer gave. */
function seasOf(answer: PlacesNow, refs: readonly PlaceRef[]) {
  return refs.flatMap((ref) => {
    const sea = answer.places.find((one) => one.place.kind === ref.kind && one.place.id === ref.id);
    return sea ? [{ ref, sea }] : [];
  });
}

/**
 * The hours a timeline has an entry at, from the hour now, and the moment its last entry, which
 * asks for the app to be opened, begins: once no place has a figure left to show, two days ahead
 * at most. A timeline whose places have nothing to show ends an hour after it begins.
 */
export function timelineHours(seas: readonly SeaNow[], now: Date) {
  const start = startOfHour(now.getTime());
  const ends = seas.flatMap((sea) => goodUntil(sea, now) ?? []);
  const end = Math.min(
    start + HOURS_AHEAD * HOUR_MS,
    ends.length > 0 ? Math.max(...ends) : start + HOUR_MS,
  );
  const hours: Date[] = [];
  for (let hour = start; hour < end; hour += HOUR_MS) hours.push(new Date(hour));
  return { hours, end: Math.max(end, start) };
}

function notices(): Pick<WidgetProps, "empty" | "missing"> {
  return {
    empty: {
      title: m.native_widget_empty_title(),
      body: m.native_widget_empty_body(),
      url: SAVED_URL,
    },
    missing: {
      title: m.native_widget_missing_title(),
      body: m.native_widget_missing_body(),
      url: SAVED_URL,
    },
  };
}

/** What a signed-out phone's widgets show: that the account is signed out, and the sign-in. */
export function signedOutNotice(): WidgetNotice {
  return {
    title: m.native_widget_signed_out_title(),
    body: m.native_widget_signed_out_body(),
    url: SIGN_IN_URL,
  };
}

const ALL: readonly WidgetName[] = Object.values(WIDGET);

/**
 * Every widget's timeline: one entry, which says that the account is signed out. It is dated
 * at the epoch, which is past whenever it is written, so that writing it again changes nothing
 * and the system draws the widget again only when the words do.
 */
export function signedOutTimelines(): WidgetTimelines {
  const entry = {
    date: new Date(0),
    props: { palette: WIDGET_PALETTE, notice: signedOutNotice() },
  };
  return Object.fromEntries(ALL.map((name) => [name, [entry]])) as WidgetTimelines;
}

/**
 * Every widget's timeline from one answer of `places.now`: an entry for each hour from the hour
 * now, as far as the kept forecast goes, then a last one that asks for the app to be opened. Each
 * widget is given the places it may show: those whose place is chosen all of them, the widget of
 * the favourites its first three.
 */
export function timelinesOf({
  answer,
  places,
  now,
}: {
  answer: PlacesNow;
  places: WidgetPlaces;
  now: Date;
}): WidgetTimelines {
  const seas = seasOf(answer, places.places);
  const favorites = places.favorites.map(keyOf);
  const { hours, end } = timelineHours(
    seas.map(({ sea }) => sea),
    now,
  );
  const dates = [...hours, new Date(end)];

  const propsAt = (at: Date, view: WidgetView): WidgetProps => {
    const shown =
      view === "favorites" ? seas.filter(({ ref }) => favorites.includes(keyOf(ref))) : seas;
    return {
      palette: WIDGET_PALETTE,
      view,
      places: Object.fromEntries(
        shown.map(({ ref, sea }) => [keyOf(ref), placeAt(sea, ref, at, end, view === "hours")]),
      ),
      favorites,
      ...notices(),
    };
  };
  const timeline = (view: WidgetView) =>
    dates.map((date) => ({ date, props: propsAt(date, view) }));

  return {
    [WIDGET.seaNow]: timeline("sea"),
    [WIDGET.nextHours]: timeline("hours"),
    [WIDGET.favorites]: timeline("favorites"),
  };
}

/**
 * What a widget whose place is chosen offers: the first of the favourites, then each place the
 * widgets read, by its name, with what it is. A place the answer left out is not offered.
 */
export function placeOptions(
  answer: PlacesNow | null,
  places: readonly PlaceRef[],
): WidgetConfigurationEnum[] {
  const first = { name: m.native_widget_first_favorite(), value: FIRST_FAVORITE };
  if (!answer) return [first];
  return [
    first,
    ...seasOf(answer, places).map(({ ref, sea }) => ({
      name: sea.place.name,
      value: keyOf(ref),
      subtitle: kindWord(ref.kind, sea),
    })),
  ];
}
