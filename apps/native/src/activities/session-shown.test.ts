import { describe, expect, it } from "vitest";

import type { LiveSession } from "@/components/sessions/live-logic";

import { END_URL, OPEN_URL, type SessionWriting, sessionShown } from "./session-shown";

const start = Date.UTC(2026, 9, 20, 7, 5);
const HOUR_MS = 60 * 60 * 1000;

const writing: SessionWriting = {
  clock: (moment) => `${moment.getUTCHours()}:${String(moment.getUTCMinutes()).padStart(2, "0")}`,
  height: (meters) => `${meters.toFixed(1)} m`,
  wind: (knots) => `${Math.round(knots)} kn`,
  compass: (degrees) => (degrees === 100 ? "E" : "?"),
  shore: (atShore) => (atShore === "offshore" ? "offshore" : null),
  m: {
    since: ({ time }) => `Since ${time}`,
    high: ({ time, height }) => `High tide ${time} · ${height}`,
    low: ({ time, height }) => `Low tide ${time} · ${height}`,
    wind: ({ wind, time }) => `Wind ${wind} at ${time}`,
    end: () => "End",
  },
};

const session: LiveSession = {
  place: { kind: "spot", id: "spot-1", name: "Chez moi" },
  startedAt: start,
  shown: true,
  figures: {
    high: { at: Date.UTC(2026, 9, 20, 10, 32), heightMeters: 3.1 },
    low: { at: Date.UTC(2026, 9, 20, 16, 50), heightMeters: 1 },
    wind: {
      at: Date.UTC(2026, 9, 20, 7, 0),
      speedMetersPerSecond: 5.1,
      gustMetersPerSecond: null,
      directionDegrees: 100,
      atShore: "offshore",
    },
  },
};

describe("what the phone shows of a session in progress", () => {
  it("is the place, its start, the next high and low, and the wind measured then", () => {
    const shown = sessionShown(session, writing);
    expect(shown.place).toBe("Chez moi");
    expect(shown.since).toBe("Since 7:05");
    expect(shown.lines).toEqual([
      "High tide 10:32 · 3.1 m",
      "Low tide 16:50 · 1.0 m",
      "Wind 10 kn E, offshore at 7:00",
    ]);
  });

  it("counts for eight hours at most, the time iOS keeps an activity", () => {
    expect(sessionShown(session, writing).endsBy - start).toBe(8 * HOUR_MS);
  });

  it("opens the session in progress, and its end the form", () => {
    const shown = sessionShown(session, writing);
    expect(shown.openUrl).toBe(OPEN_URL);
    expect(shown.endUrl).toBe(END_URL);
    expect(END_URL).toBe("app.tonnr://session/live?end=1");
  });

  it("says the place and the time alone when the API did not answer", () => {
    expect(sessionShown({ ...session, figures: null }, writing).lines).toEqual([]);
  });

  it("says what of the wind was measured, and nothing when nothing was", () => {
    const wind = session.figures?.wind;
    if (!wind) throw new Error("the sample has a wind");
    const without = (part: Partial<typeof wind>) =>
      sessionShown(
        { ...session, figures: { high: null, low: null, wind: { ...wind, ...part } } },
        writing,
      ).lines;
    expect(without({ atShore: null })).toEqual(["Wind 10 kn E at 7:00"]);
    expect(without({ speedMetersPerSecond: null, directionDegrees: null, atShore: null })).toEqual(
      [],
    );
  });
});
