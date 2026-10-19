import { describe, expect, it } from "vitest";

import type { AlertPreview } from "../viewer/types";
import { hasSeaAhead, heldBack, hoursAhead, judgeTried, openPieces } from "./trial";

type Tried = AlertPreview["spots"][number];

const at = (time: string) => new Date(`2026-10-15T${time}:00Z`);
const NOW = at("10:20").getTime();
const hour = (time: string, unmet: Tried["hours"][number]["unmet"] = []) =>
  ({ time: at(time), unmet }) as Tried["hours"][number];
const tried = (spotId: string, more: Partial<Tried>): Tried => ({
  spotId,
  breakId: null,
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
      hour("12:00", ["wavePeakPeriodSeconds"]),
      // Two conditions rule this one out: it is neither's alone.
      hour("13:00", ["windSpeedMetersPerSecond", "wavePeakPeriodSeconds"]),
      hour("14:00"),
    ];

    expect(heldBack(hours)).toEqual([
      ["windSpeedMetersPerSecond", 2],
      ["wavePeakPeriodSeconds", 1],
    ]);
  });
});

describe("conditions judged by the editor", () => {
  // Six hours of sea, from 06:00, with waves that grow from 0.5 m to 3 m.
  const sea = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"].map(
    (time, index) =>
      ({
        ...hour(time),
        waveHeightMeters: [0.5, 1, 1.5, 2, 2.5, 3][index]!,
        tideSegment: index < 3 ? "mid_rising" : "high",
        tideCoefficient: 95,
      }) as Tried["hours"][number],
  );
  // The account can go from 07:00 to 11:00.
  const preview = tried("one", {
    hours: sea,
    windows: [{ start: at("06:00"), end: at("12:00") }],
    open: [{ start: at("07:00"), end: at("11:00") }],
  });

  it("finds the windows of the conditions, within the hours the account can go", () => {
    const judged = judgeTried(preview, { waveHeightMeters: { min: 1 } }, 60);

    expect(judged.windows).toEqual([{ start: at("07:00"), end: at("12:00") }]);
    expect(judged.open).toEqual([{ start: at("07:00"), end: at("11:00") }]);
    expect(judged.hours[0]!.unmet).toEqual(["waveHeightMeters"]);
  });

  it("drops what is shorter than the shortest window", () => {
    const criteria = { tideCycle: ["mid_rising" as const] };

    expect(judgeTried(preview, criteria, 120).open).toEqual([
      { start: at("07:00"), end: at("09:00") },
    ]);
    expect(judgeTried(preview, criteria, 180).open).toEqual([]);
  });

  it("finds an hour that any value of a part meets", () => {
    const judged = judgeTried(
      preview,
      { waveHeightMeters: { max: 0.6 }, or: { waveHeightMeters: [{ min: 2.5 }] } },
      60,
    );

    expect(judged.windows).toEqual([
      { start: at("06:00"), end: at("07:00") },
      { start: at("10:00"), end: at("12:00") },
    ]);
    expect(judged.open).toEqual([{ start: at("10:00"), end: at("11:00") }]);
  });
});
