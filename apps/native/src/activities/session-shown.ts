import { toKnots } from "@repo/client/format";
import { APP_SCHEME } from "@repo/config/app";

import { LONGEST_MS, type LiveFigures, type LiveSession } from "@/components/sessions/live-logic";

// What the phone shows of a session in progress outside the app: its Live Activity on an iPhone,
// its Live Update on Android (decision 074, "A session in progress"). The app writes it once, as
// the session begins, in the account's units and language: the place's name, when it began, the
// next high and low, and the wind as it was measured then, with its time and where it comes
// from, an arrow before the point as everywhere in the app. The time since the start counts on
// the phone, with nothing sent.

/** The routes a press opens: the session in progress, and its end, which opens its form. */
export const LIVE_ROUTE = "session/live";
export const OPEN_URL = `${APP_SCHEME}://${LIVE_ROUTE}`;
export const END_URL = `${APP_SCHEME}://${LIVE_ROUTE}?end=1`;

/**
 * The wind as a session in progress shows it: the way it blows drawn as an arrow, then the point
 * it comes from, as `Bearing` writes a direction, between the words of the line before and after
 * them. Never the point alone.
 */
export type SessionWind = {
  // "Wind 10 kn", the line itself when no direction was measured.
  before: string;
  // Where it comes from and where it goes, in degrees, which the arrow turns to, and the point it
  // comes from, "E": null when no direction was measured.
  bearing: { from: number; toward: number; point: string } | null;
  // ", offshore at 9:00", after the point.
  after: string;
  // The line where no arrow is drawn, in a notification's text: "Wind 10 kn ← E, offshore at 9:00".
  text: string;
  // The line as a screen reader says it: "Wind 10 kn from east, offshore at 9:00".
  spoken: string;
};

/** What the activity and the notification are given, every word written already. */
export type SessionShown = {
  // "Session in progress", which a screen reader says of the surfer drawn in the Dynamic Island.
  title: string;
  place: string;
  startedAt: number;
  // The end of what the timer counts to: iOS ends the activity then.
  endsBy: number;
  // "Since 9:05".
  since: string;
  // "High tide 10:32 · 3.1 m", "Low tide 16:50 · 1.0 m".
  lines: string[];
  wind: SessionWind | null;
  end: string;
  openUrl: string;
  endUrl: string;
};

/** How the app writes what the session shows: its messages, its units and its clock. */
export type SessionWriting = {
  clock: (moment: Date) => string;
  height: (meters: number) => string;
  wind: (knots: number) => string;
  // The point a direction comes from, "E", and its whole name, "east", as a screen reader says it.
  compass: (degrees: number) => string;
  compassName: (degrees: number) => string;
  shore: (atShore: string) => string | null;
  m: {
    title: () => string;
    since: (values: { time: string }) => string;
    high: (values: { time: string; height: string }) => string;
    low: (values: { time: string; height: string }) => string;
    wind: (values: { wind: string; time: string }) => string;
    // "from", before the name of the point a direction comes from.
    from: () => string;
    end: () => string;
  };
};

// Where the direction stands in the wind's line, which no message holds: the line is written
// once, in the words of its language, and parted there.
const MARK = "\u2063";

// An arrow of text toward each of the eight points, from the north, for a notification's text.
const ARROWS = ["\u2191", "\u2197", "\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196"];

/** The arrow of text nearest the way something goes, in degrees. */
export const arrowToward = (toward: number) =>
  ARROWS[Math.round((((toward % 360) + 360) % 360) / 45) % ARROWS.length] ?? ARROWS[0];

/** The wind's line, parted around its direction, or null when nothing of it was measured. */
function windOf(wind: NonNullable<LiveFigures["wind"]>, writing: SessionWriting) {
  const speed =
    wind.speedMetersPerSecond === null ? null : writing.wind(toKnots(wind.speedMetersPerSecond));
  const shore = wind.atShore ? writing.shore(wind.atShore) : null;
  const from = wind.directionDegrees;
  // The line with `direction` where the direction goes.
  const line = (direction: string | null) => {
    const said = [[speed, direction].filter((part) => part).join(" "), shore]
      .filter((part) => part)
      .join(", ");
    return said ? writing.m.wind({ wind: said, time: writing.clock(new Date(wind.at)) }) : null;
  };
  const parted = line(from === null ? null : MARK);
  if (parted === null) return null;
  if (from === null) {
    return { before: parted, bearing: null, after: "", text: parted, spoken: parted };
  }
  const [before = "", after = ""] = parted.split(MARK);
  const toward = (from + 180) % 360;
  const point = writing.compass(from);
  return {
    before: before.trimEnd(),
    bearing: { from, toward, point },
    after,
    text: `${before}${arrowToward(toward)} ${point}${after}`,
    spoken: line(`${writing.m.from()} ${writing.compassName(from)}`) ?? parted,
  };
}

/** What the phone shows of a session in progress, as it began. */
export function sessionShown(session: LiveSession, writing: SessionWriting): SessionShown {
  const { figures } = session;
  const lines: string[] = [];
  if (figures?.high) {
    lines.push(
      writing.m.high({
        time: writing.clock(new Date(figures.high.at)),
        height: writing.height(figures.high.heightMeters),
      }),
    );
  }
  if (figures?.low) {
    lines.push(
      writing.m.low({
        time: writing.clock(new Date(figures.low.at)),
        height: writing.height(figures.low.heightMeters),
      }),
    );
  }
  return {
    title: writing.m.title(),
    place: session.place.name,
    startedAt: session.startedAt,
    endsBy: session.startedAt + LONGEST_MS,
    since: writing.m.since({ time: writing.clock(new Date(session.startedAt)) }),
    lines,
    wind: figures?.wind ? windOf(figures.wind, writing) : null,
    end: writing.m.end(),
    openUrl: OPEN_URL,
    endUrl: END_URL,
  };
}
