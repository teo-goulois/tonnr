import { APP_NAME } from "@repo/config/app";

import type { Locale } from "./verification";

// What an alert has to say, in words: decision 031. A mail and a push write the same moments,
// the same hours and the same figures, in the account's language, time zone and units. They are
// written here once, and each way out lays them out as it does: `alerts.ts` for a mail, and
// `packages/push/src/alerts.ts` for a push.

// What an alert tells. "news" says several things at once, of hours that are new, that moved or
// that are gone.
export type AlertMoment = "found" | "moved" | "gone" | "news" | "evening" | "begins";

type Stretch = { start: Date; end: Date };

/** The units the figures are written in: those the account chose, as on its screens. Decision 033. */
export type AlertUnits = {
  windSpeed: "kn" | "kmh" | "ms" | "mph";
  height: "m" | "ft";
  distance: "km" | "mi";
};

/** What an account that chose no unit reads in. */
export const STARTING_UNITS: AlertUnits = { windSpeed: "kn", height: "m", distance: "km" };

/** What an alert says of one spot. */
export type AlertLine = {
  spotName: string;
  // For the evening before: the alert the spot is in.
  alertName?: string;
  // Open hours that are told: new ones, those that begin, or those of the day listed.
  open: Stretch[];
  // Hours that were told and that have moved: what they are now, and what they were.
  moved?: { open: Stretch[]; before: Stretch[] };
  // Hours that were told and that are no longer forecast.
  gone?: Stretch[];
  // What the forecast gave for one hour of the hours that are told, and which hour: the first
  // of them, or the one the message leaves in when they have begun.
  sea?: {
    at: Date;
    swellHeightMeters: number | null;
    swellPeriodSeconds: number | null;
    swellDirectionDegrees?: number | null;
    windSpeedMetersPerSecond: number | null;
    windDirectionDegrees?: number | null;
  };
  // When the forecast the hours were found in was fetched.
  forecastFetchedAt?: Date;
  // What a wave station nearby measured as the window began.
  station?: {
    name: string;
    distanceKm: number;
    observedAt: Date;
    significantHeightMeters: number | null;
    peakPeriodSeconds: number | null;
    // Where the waves come from, clockwise from north.
    peakDirectionDegrees?: number | null;
    // Who its readings are credited to.
    attribution?: string;
  } | null;
};

/** What an alert says, whichever way it leaves by. */
export type AlertSaid = {
  locale: Locale;
  moment: AlertMoment;
  // The alert's name. Null for the evening before, which lists every alert.
  alertName: string | null;
  // The time zone the hours are written in: the account's.
  zone: string;
  // For the evening before: the day it lists, as "2026-10-15".
  day?: string;
  units: AlertUnits;
  lines: AlertLine[];
};

// A metre a second, a metre and a kilometre in each unit.
const PER_MS = { kn: 3600 / 1852, kmh: 3.6, ms: 1, mph: 3.6 / 1.609344 };
const PER_METER = { m: 1, ft: 1 / 0.3048 };
const PER_KM = { km: 1, mi: 1 / 1.609344 };

const WORDS = {
  en: {
    moment: {
      found: "a window is taking shape",
      moved: "the window has moved",
      gone: "the window is no longer forecast",
      news: "there is news",
      evening: "what is forecast",
      begins: "it is on",
    },
    generic: `One of your ${APP_NAME} alerts has news`,
    to: "to",
    movedRow: (now: string, before: string) => `Moved: ${now} (it was ${before})`,
    goneRow: (hours: string) => `No longer forecast: ${hours}`,
    forecastFor: (hour: string) => `Forecast for ${hour}`,
    swell: "swell",
    wind: "wind",
    knots: "kn",
    points: "N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSW,SW,WSW,W,WNW,NW,NNW",
    station: (name: string, distance: string) => `Waves at ${name}, ${distance} away`,
    open: "Open the spot",
    forecast: "Forecast",
    // What the licence of the forecast asks to be said: its values were changed.
    rounded: "These values are rounded and written in your units.",
    readings: "Readings",
    fetched: "forecast fetched",
    settings: "Set your alerts",
    off: "Stop these mails",
  },
  fr: {
    moment: {
      found: "un créneau se dessine",
      moved: "le créneau a bougé",
      gone: "le créneau n’est plus prévu",
      news: "du nouveau",
      evening: "ce qui est prévu",
      begins: "c’est le moment",
    },
    generic: `Une de tes alertes ${APP_NAME} a du nouveau`,
    to: "à",
    movedRow: (now: string, before: string) => `A bougé : ${now} (c’était ${before})`,
    goneRow: (hours: string) => `Plus prévu : ${hours}`,
    forecastFor: (hour: string) => `Prévu pour ${hour}`,
    swell: "houle",
    wind: "vent",
    knots: "nd",
    points: "N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSO,SO,OSO,O,ONO,NO,NNO",
    station: (name: string, distance: string) => `Vagues à ${name}, à ${distance}`,
    open: "Ouvrir le spot",
    forecast: "Prévisions",
    rounded: "Ces valeurs sont arrondies et écrites dans tes unités.",
    readings: "Mesures",
    fetched: "prévision lue",
    settings: "Régler tes alertes",
    off: "Ne plus recevoir ces mails",
  },
};

/**
 * The words of what an alert says: its headline, and for each spot its name, its hours as rows,
 * what the forecast gave for one of them, when that forecast was fetched, and what a station
 * nearby measured. A direction is a point of the compass with its figure, never the name alone.
 */
export function alertWords(said: AlertSaid) {
  const { locale, zone, moment, units } = said;
  const words = WORDS[locale];
  const tag = locale === "fr" ? "fr-FR" : "en-GB";
  const dayAndClock = new Intl.DateTimeFormat(tag, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const clock = new Intl.DateTimeFormat(tag, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayOnly = new Intl.DateTimeFormat(tag, {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // A calendar day is written as it is named, whatever the zone: noon UTC of that date is
  // another day east of the date line.
  const calendarDay = new Intl.DateTimeFormat(tag, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const sameDay = (one: Date, other: Date) => dayOnly.format(one) === dayOnly.format(other);
  const number = (value: number, digits: number) =>
    value.toLocaleString(tag, { maximumFractionDigits: digits });
  const height = (meters: number) =>
    `${number(meters * PER_METER[units.height], 1)} ${units.height}`;
  const wind = (metersPerSecond: number) =>
    `${number(metersPerSecond * PER_MS[units.windSpeed], 0)} ${
      { kn: words.knots, kmh: "km/h", ms: "m/s", mph: "mph" }[units.windSpeed]
    }`;
  // Where it comes from, as a point of the compass and its figure: never the name alone.
  const from = (degrees: number) => {
    const turned = ((degrees % 360) + 360) % 360;
    return `${words.points.split(",")[Math.round(turned / 22.5) % 16]} ${number(turned, 0)}°`;
  };
  const hours = (stretch: Stretch) =>
    `${dayAndClock.format(stretch.start)} ${words.to} ${
      // Hours that end at midnight end that evening.
      sameDay(stretch.start, new Date(stretch.end.getTime() - 60_000))
        ? clock.format(stretch.end)
        : dayAndClock.format(stretch.end)
    }`;

  // French puts a space before a colon.
  const colon = locale === "fr" ? " :" : ":";
  const listed = said.day
    ? calendarDay
        .format(new Date(`${said.day}T12:00:00Z`))
        .replace(/^./, (first) => first.toUpperCase())
    : "";
  const headline =
    moment === "evening"
      ? `${listed}${colon} ${words.moment.evening}`
      : `${said.alertName ?? ""}${colon} ${words.moment[moment]}`;

  const blocks = said.lines.map((line) => {
    const rows = line.open.map(hours);
    if (line.moved) {
      rows.push(
        words.movedRow(
          line.moved.open.map(hours).join(", "),
          line.moved.before.map(hours).join(", "),
        ),
      );
    }
    for (const stretch of line.gone ?? []) rows.push(words.goneRow(hours(stretch)));
    const sea = line.sea;
    // The forecast is said of hours that are there: not of hours that are gone alone.
    const figures =
      sea && (line.open.length > 0 || line.moved)
        ? [
            sea.swellHeightMeters !== null &&
              [
                `${words.swell} ${height(sea.swellHeightMeters)}`,
                sea.swellPeriodSeconds !== null && `${number(sea.swellPeriodSeconds, 0)} s`,
                typeof sea.swellDirectionDegrees === "number" && from(sea.swellDirectionDegrees),
              ]
                .filter(Boolean)
                .join(", "),
            sea.windSpeedMetersPerSecond !== null &&
              [
                `${words.wind} ${wind(sea.windSpeedMetersPerSecond)}`,
                typeof sea.windDirectionDegrees === "number" && from(sea.windDirectionDegrees),
              ]
                .filter(Boolean)
                .join(", "),
          ].filter(Boolean)
        : [];
    const station = line.station;
    const waves =
      station && station.significantHeightMeters !== null
        ? [
            height(station.significantHeightMeters),
            station.peakPeriodSeconds !== null && `${number(station.peakPeriodSeconds, 0)} s`,
            typeof station.peakDirectionDegrees === "number" && from(station.peakDirectionDegrees),
            dayAndClock.format(station.observedAt),
          ].filter(Boolean)
        : null;
    return {
      // The spot, and for the evening before the alert it is listed under.
      title:
        line.alertName && line.alertName !== line.spotName
          ? `${line.spotName} (${line.alertName})`
          : line.spotName,
      // The hours it speaks of: new ones as they are, then those that moved and those that went.
      hours: rows,
      // What the forecast gave for one hour, which it names. Null when it says nothing of it.
      forecast:
        sea && figures.length > 0
          ? `${words.forecastFor(dayAndClock.format(sea.at))}${colon} ${figures.join(" ; ")}`
          : null,
      // When that forecast was fetched. Empty when it is not known.
      fetched: line.forecastFetchedAt
        ? `${words.fetched} ${dayAndClock.format(line.forecastFetchedAt)}`
        : "",
      // What a station nearby measured. Null without a reading of the waves' height.
      station:
        station && waves
          ? `${words.station(
              station.name,
              `${number(station.distanceKm * PER_KM[units.distance], 0)} ${units.distance}`,
            )}${colon} ${waves.join(", ")}`
          : null,
    };
  });

  return { words, colon, headline, blocks };
}
