import { APP_SCHEME } from "@repo/config/app";

import { LONGEST_MS, type LiveSession } from "@/components/sessions/live-logic";

// What the phone shows of a session in progress outside the app: its Live Activity on an iPhone,
// its Live Update on Android (decision 074, "A session in progress"). The app writes it once, as
// the session begins, in the account's units and language: the place's name, when it began, the
// next high and low, and the wind as it was measured then, with its time. The time since the
// start counts on the phone, with nothing sent.

/** The routes a press opens: the session in progress, and its end, which opens its form. */
export const LIVE_ROUTE = "session/live";
export const OPEN_URL = `${APP_SCHEME}://${LIVE_ROUTE}`;
export const END_URL = `${APP_SCHEME}://${LIVE_ROUTE}?end=1`;

/** What the activity and the notification are given, every word written already. */
export type SessionShown = {
  place: string;
  startedAt: number;
  // The end of what the timer counts to: iOS ends the activity then.
  endsBy: number;
  // "Since 9:05".
  since: string;
  // "High tide 10:32 · 3.1 m", "Low tide 16:50 · 1.0 m", "Wind 10 kn E, offshore at 9:00".
  lines: string[];
  end: string;
  openUrl: string;
  endUrl: string;
};

/** How the app writes what the session shows: its messages, its units and its clock. */
export type SessionWriting = {
  clock: (moment: Date) => string;
  height: (meters: number) => string;
  wind: (knots: number) => string;
  compass: (degrees: number) => string;
  shore: (atShore: string) => string | null;
  m: {
    since: (values: { time: string }) => string;
    high: (values: { time: string; height: string }) => string;
    low: (values: { time: string; height: string }) => string;
    wind: (values: { wind: string; time: string }) => string;
    end: () => string;
  };
};

const KNOTS_PER_MS = 3600 / 1852;

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
  const wind = figures?.wind;
  if (wind) {
    const parts = [
      wind.speedMetersPerSecond === null
        ? null
        : writing.wind(wind.speedMetersPerSecond * KNOTS_PER_MS),
      wind.directionDegrees === null ? null : writing.compass(wind.directionDegrees),
    ].filter((part) => part !== null);
    const shore = wind.atShore ? writing.shore(wind.atShore) : null;
    const said = [parts.join(" "), shore].filter((part) => part).join(", ");
    if (said) {
      lines.push(writing.m.wind({ wind: said, time: writing.clock(new Date(wind.at)) }));
    }
  }
  return {
    place: session.place.name,
    startedAt: session.startedAt,
    endsBy: session.startedAt + LONGEST_MS,
    since: writing.m.since({ time: writing.clock(new Date(session.startedAt)) }),
    lines,
    end: writing.m.end(),
    openUrl: OPEN_URL,
    endUrl: END_URL,
  };
}
