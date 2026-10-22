import type { AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import { describe, expect, it } from "vitest";

import { alertLine, lineGroups, placesWords, spokenLine } from "./summary";
import { agoWords, buoyWords, lineWords, noticeWords, toldOf } from "./told";
import { bearingWords, durationWords } from "./words";

// What the alerts' tab and an alert's row say, in the app's words, which are the web's.

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
const NOW = at(19, 18);

function notification(id: string, time: number, more: Partial<AlertNotification> = {}) {
  return {
    id,
    alertId: "alert",
    moment: "found",
    payload: {
      alertName: "Small clean days",
      zone: "UTC",
      lines: [{ spotId: "spot", spotName: "La Nord", open: [] }],
    },
    readAt: null,
    createdAt: new Date(time),
    ...more,
  } as AlertNotification;
}

function notice(id: string, time: number, more: Partial<ReportNotice> = {}) {
  return {
    id,
    breakId: "break",
    breakName: "Parlementia",
    createdAt: new Date(time),
    updatedAt: new Date(time),
    readAt: null,
    told: 1,
    shown: 1,
    state: "shown",
    latest: { reportId: "r", author: "teo", waveSize: "chest", note: "Clean", thumb: null },
    ...more,
  } as ReportNotice;
}

describe("what was told", () => {
  it("puts both kinds together, the newest first, in one list", () => {
    const told = toldOf(
      [notification("a", at(19, 8)), notification("b", at(17, 9))],
      [notice("n", at(18, 20))],
    );

    expect(told.map((one) => [one.kind, one.at])).toEqual([
      ["notification", at(19, 8)],
      ["notice", at(18, 20)],
      ["notification", at(17, 9)],
    ]);
  });

  it("says what the nearest buoy measured, its direction apart for the arrow", () => {
    type Line = AlertNotification["payload"]["lines"][number];
    const buoy = {
      stationId: "candhis/anglet",
      name: "Anglet",
      distanceKm: 3,
      significantHeightMeters: 1.5,
      peakPeriodSeconds: 12,
      peakDirectionDegrees: 290,
      observedAt: "2026-10-20T08:00:00Z",
      attribution: "Candhis",
    };
    const line = { spotId: "spot", spotName: "La Nord", open: [], buoy } as Line;
    const said = buoyWords(line, "UTC");

    expect(said?.direction).toBe(290);
    expect(said?.measured).toMatch(/^Waves at Anglet, .+ away: .+$/);
    // A screen reader hears the point by its full name.
    expect(said?.spoken).toMatch(/west-northwest/i);
    expect(said?.credit).toBe("Readings: Candhis");
    const unread = { ...line, buoy: { ...buoy, significantHeightMeters: null } } as Line;
    expect(buoyWords(unread, "UTC")).toBeUndefined();
  });

  it("says just now of a notice in its first minute", () => {
    expect(agoWords(new Date(NOW - 30_000), NOW)).toBe("just now");
  });

  it("says where a window moved from", () => {
    const line = {
      spotId: "spot",
      spotName: "La Nord",
      open: [{ start: "2026-10-20T08:00:00Z", end: "2026-10-20T11:00:00Z" }],
      before: [{ start: "2026-10-20T14:00:00Z", end: "2026-10-20T17:00:00Z" }],
    };

    // English writes its hours on twelve.
    expect(lineWords(line, "moved", "UTC")).toMatch(
      /^La Nord · Tue 08:00 AM to 11:00 AM, instead of Tue 02:00 PM to 05:00 PM$/,
    );
    expect(lineWords(line, "gone", "UTC")).toMatch(/^La Nord · Tue 02:00 PM to 05:00 PM$/);
  });

  it("says a notice of reports by its break, its count and its newest report", () => {
    expect(noticeWords(notice("n", NOW))).toEqual({
      title: "New report at Parlementia",
      said: "teo · Chest · Clean",
    });
    expect(
      noticeWords(notice("m", NOW, { shown: 0, told: 2, state: "past", latest: null })),
    ).toEqual({ title: "2 reports at Parlementia", said: "This report is no longer shown." });
  });
});

describe("what an alert asks, in a line", () => {
  it("says each part with its other values, then the shortest window", () => {
    const line = alertLine({
      criteria: {
        waveHeightMeters: { min: 1, max: 2 },
        or: { waveHeightMeters: [{ min: 3 }] },
        windSpeedMetersPerSecond: { max: 5 },
        windDirectionDegrees: { from: 45, to: 135 },
      },
      shortestMinutes: 120,
    });

    expect(line.groups).toEqual([
      ["Waves", [[{ text: "1–2 m" }, { text: "3 m or more" }]]],
      ["Wind", [[{ text: "10 kn or less" }], [{ arc: { from: 45, to: 135 } }]]],
    ]);
    expect(line.after).toBe("2 h at least");
    // A screen reader hears the directions by their names, and no arrow.
    expect(line.spoken).toMatch(/^Waves 1–2 m or 3 m or more\. Wind 10 kn or less, /);
    expect(line.spoken).toMatch(/2 h at least$/);
    expect(line.spoken).not.toMatch(/[↙↖]/);
  });

  it("says the way of an older alert's tide apart, for its arrow", () => {
    expect(lineGroups({ tideTrend: "rising" })).toEqual([["Tide", [[{ trend: "rising" }]]]]);
    expect(spokenLine({ tideTrend: "falling" })).toBe("Tide falling");
  });

  it("leaves out what asks nothing", () => {
    expect(lineGroups({})).toEqual([]);
    expect(spokenLine({})).toBe("");
  });
});

describe("the app's words", () => {
  it("writes a direction with the arrow of the way it goes, then where it comes from", () => {
    expect(bearingWords(270)).toBe("→ W");
    expect(bearingWords(0)).toBe("↓ N");
  });

  it("names a few places in a few words", () => {
    expect(placesWords(["Hossegor"])).toBe("Hossegor");
    expect(placesWords(["Hossegor", "La Nord"])).toBe("Hossegor and La Nord");
    expect(placesWords(["Hossegor", "La Nord", "Les Estagnots"])).toBe("Hossegor and 2 more");
  });

  it("says a length by the quarter hour", () => {
    expect(durationWords(120)).toBe("2 h");
    expect(durationWords(150)).toBe("2 h 30");
  });
});
