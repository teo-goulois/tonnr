import { describe, expect, it } from "vitest";

import type { AlertPreview } from "../viewer/types";
import { hasSeaAhead, heldBack, hoursAhead, openPieces } from "./alert-trial";

type Tried = AlertPreview["spots"][number];

const at = (time: string) => new Date(`2026-10-15T${time}:00Z`);
const NOW = at("10:20").getTime();
const hour = (time: string, unmet: Tried["hours"][number]["unmet"] = []) =>
  ({ time: at(time), unmet }) as Tried["hours"][number];
const tried = (spotId: string, more: Partial<Tried>): Tried => ({
  spotId,
  hasSea: true,
  hasTide: true,
  hours: [],
  windows: [],
  open: [],
  forecastFetchedAt: at("09:00"),
  forecastStale: false,
  ...more,
});

describe("what a trial gives", () => {
  it("reads the hours from this one on", () => {
    const hours = [hour("08:00"), hour("09:00"), hour("10:00"), hour("11:00")];

    expect(hoursAhead(tried("one", { hours }), NOW).map((one) => one.time)).toEqual([
      at("10:00"),
      at("11:00"),
    ]);
    expect(hoursAhead(undefined, NOW)).toEqual([]);
  });

  it("lists the windows that are not over, the soonest first, at every spot", () => {
    const pieces = openPieces(
      [
        tried("one", {
          open: [
            { start: at("06:00"), end: at("10:00") },
            { start: at("14:00"), end: at("17:00") },
          ],
        }),
        tried("two", { open: [{ start: at("09:00"), end: at("12:00") }] }),
      ],
      NOW,
    );

    expect(pieces.map((piece) => [piece.spotId, piece.start])).toEqual([
      ["two", at("09:00")],
      ["one", at("14:00")],
    ]);
  });

  it("knows a sea that is there with no hour to use it", () => {
    const sea = { windows: [{ start: at("12:00"), end: at("13:00") }] };

    expect(hasSeaAhead([tried("one", sea)], NOW)).toBe(true);
    expect(
      hasSeaAhead([tried("one", { windows: [{ start: at("06:00"), end: at("09:00") }] })], NOW),
    ).toBe(false);
  });

  it("counts for a condition the hours that it alone rules out", () => {
    const hours = [
      hour("10:00", ["windSpeedMetersPerSecond"]),
      hour("11:00", ["windSpeedMetersPerSecond"]),
      hour("12:00", ["swellPeriodSeconds"]),
      // Two conditions rule this one out: it is neither's alone.
      hour("13:00", ["windSpeedMetersPerSecond", "swellPeriodSeconds"]),
      hour("14:00"),
    ];

    expect(heldBack(hours)).toEqual([
      ["windSpeedMetersPerSecond", 2],
      ["swellPeriodSeconds", 1],
    ]);
  });
});
