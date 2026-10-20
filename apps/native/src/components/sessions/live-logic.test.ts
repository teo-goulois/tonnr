import { describe, expect, it } from "vitest";

import {
  LONGEST_MS,
  type LiveSession,
  elapsedOf,
  figuresOf,
  formQueryOf,
  liveMinutes,
  liveStateOf,
  readLiveSession,
  timedOf,
} from "./live-logic";

const MINUTE_MS = 60 * 1000;
const start = Date.parse("2026-10-20T07:05:00.000Z");

const session: LiveSession = {
  place: { kind: "break", id: "break-9", name: "Parlementia" },
  startedAt: start,
  figures: null,
  shown: true,
};

describe("the length a session in progress is written with", () => {
  it("is rounded to five minutes", () => {
    expect(liveMinutes(start, start + 97 * MINUTE_MS + 20_000)).toBe(95);
    expect(liveMinutes(start, start + 98 * MINUTE_MS)).toBe(100);
  });

  it("is a quarter of an hour at least and eight hours at most", () => {
    expect(liveMinutes(start, start + 3 * MINUTE_MS)).toBe(15);
    expect(liveMinutes(start, start + 11 * 60 * MINUTE_MS)).toBe(480);
  });
});

describe("the time since a session began", () => {
  it("is written in hours, minutes and seconds, from the start", () => {
    expect(elapsedOf(start, start + 7 * MINUTE_MS + 42_000)).toBe("0:07:42");
    expect(elapsedOf(start, start + 83 * MINUTE_MS + 5_000)).toBe("1:23:05");
    // A clock that went back says nothing below nought.
    expect(elapsedOf(start, start - MINUTE_MS)).toBe("0:00:00");
  });
});

describe("what a session in progress is now", () => {
  it("runs while the phone shows it, for eight hours at most", () => {
    expect(liveStateOf(session, start + MINUTE_MS, true)).toBe("running");
    expect(liveStateOf(session, start + MINUTE_MS, undefined)).toBe("running");
    expect(liveStateOf(session, start + LONGEST_MS, true)).toBe("unended");
  });

  it("was never ended once what the phone showed of it was swiped away", () => {
    expect(liveStateOf(session, start + MINUTE_MS, false)).toBe("unended");
    // What the phone never showed was never swiped away.
    expect(liveStateOf({ ...session, shown: false }, start + MINUTE_MS, false)).toBe("running");
  });

  it("is ended once it was ended, whatever the phone shows", () => {
    expect(liveStateOf({ ...session, endedAt: start + 60 * MINUTE_MS }, start, true)).toBe("ended");
  });
});

describe("the form a session in progress opens", () => {
  it("holds its place, its start and, once ended, its length", () => {
    expect(formQueryOf({ ...session, endedAt: start + 92 * MINUTE_MS })).toEqual({
      place: "break:break-9",
      name: "Parlementia",
      start: "2026-10-20T07:05:00.000Z",
      minutes: "90",
      live: "1",
    });
  });

  it("leaves the length to the surfer for a session never ended", () => {
    expect(formQueryOf(session)).not.toHaveProperty("minutes");
  });

  it("takes from its route a start that has begun and a length within the form's", () => {
    const now = start + 2 * 60 * MINUTE_MS;
    expect(timedOf({ start: "2026-10-20T07:05:00.000Z", minutes: "92" }, now)).toEqual({
      startedAt: new Date(start),
      minutes: 90,
    });
    expect(timedOf({ start: "2026-10-20T07:05:00.000Z" }, now)?.minutes).toBeNull();
    expect(timedOf({ start: "2026-10-20T12:00:00.000Z" }, now)).toBeNull();
    expect(timedOf({ start: "yesterday" }, now)).toBeNull();
    expect(timedOf({}, now)).toBeNull();
  });
});

describe("a session in progress as the phone keeps it", () => {
  it("is read back as it was written", () => {
    const kept: LiveSession = {
      ...session,
      endedAt: start + 30 * MINUTE_MS,
      figures: {
        high: { at: start + 3 * 60 * MINUTE_MS, heightMeters: 3.1 },
        low: null,
        wind: {
          at: start - 5 * MINUTE_MS,
          speedMetersPerSecond: 5.1,
          gustMetersPerSecond: null,
          directionDegrees: 100,
          atShore: "offshore",
        },
      },
    };
    expect(readLiveSession(JSON.stringify(kept))).toEqual(kept);
  });

  it("was not shown when the app closed before the phone said", () => {
    const { shown: _, ...asking } = session;
    expect(readLiveSession(JSON.stringify(asking))?.shown).toBe(false);
  });

  it("is nothing for what this app did not write", () => {
    expect(readLiveSession(null)).toBeNull();
    expect(readLiveSession("not json")).toBeNull();
    expect(
      readLiveSession(JSON.stringify({ place: { kind: "station", id: "x", name: "B" } })),
    ).toBeNull();
    expect(readLiveSession(JSON.stringify({ ...session, startedAt: "today" }))).toBeNull();
  });
});

describe("what the sea did as a session began", () => {
  const tide = (time: string, type: "high" | "low", heightMeters: number) => ({
    time: new Date(time),
    type,
    heightMeters,
  });
  const reading = {
    observedAt: new Date("2026-10-20T07:00:00.000Z"),
    significantHeightMeters: null,
    maxHeightMeters: null,
    peakPeriodSeconds: null,
    meanPeriodSeconds: null,
    significantPeriodSeconds: null,
    peakDirectionDegrees: null,
    directionalSpreadDegrees: null,
    waterTemperatureCelsius: null,
    windSpeedMetersPerSecond: 5.1,
    windGustMetersPerSecond: 7.7,
    windDirectionDegrees: 100,
    validated: true,
  };
  // What `places.now` answers of a place, as far as a session reads it.
  const place = {
    tide: {
      extremes: [
        tide("2026-10-20T04:10:00.000Z", "low", 0.9),
        tide("2026-10-20T10:32:00.000Z", "high", 3.1),
        tide("2026-10-20T16:50:00.000Z", "low", 1.0),
        tide("2026-10-20T23:01:00.000Z", "high", 3.0),
      ],
    },
    wind: { latestReading: reading, atShore: "offshore" },
  } as unknown as Parameters<typeof figuresOf>[0];

  it("is the next high and the next low after the start", () => {
    const figures = figuresOf(place, start);
    expect(figures?.high).toEqual({
      at: Date.parse("2026-10-20T10:32:00.000Z"),
      heightMeters: 3.1,
    });
    expect(figures?.low).toEqual({ at: Date.parse("2026-10-20T16:50:00.000Z"), heightMeters: 1.0 });
  });

  it("is the wind as the nearest station measured it, with its time", () => {
    expect(figuresOf(place, start)?.wind).toEqual({
      at: Date.parse("2026-10-20T07:00:00.000Z"),
      speedMetersPerSecond: 5.1,
      gustMetersPerSecond: 7.7,
      directionDegrees: 100,
      atShore: "offshore",
    });
  });

  it("is nothing of what was not measured, and nothing at all when the API did not answer", () => {
    const calm = {
      tide: null,
      wind: {
        latestReading: { ...reading, windSpeedMetersPerSecond: null, windDirectionDegrees: null },
        atShore: null,
      },
    } as unknown as Parameters<typeof figuresOf>[0];
    expect(figuresOf(calm, start)).toEqual({ high: null, low: null, wind: null });
    expect(figuresOf(undefined, start)).toBeNull();
  });
});
