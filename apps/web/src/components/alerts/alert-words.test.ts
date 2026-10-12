import { describe, expect, it } from "vitest";

import {
  type AlertDraft,
  asked,
  changedParts,
  conditionsKey,
  leaveFor,
  leftAfterSave,
  loosened,
  rangeAfter,
  samePart,
  sliderEnds,
  thumbsOf,
  withoutGone,
} from "./alert-words";

describe("the conditions as they are sent", () => {
  it("leave out a range with neither end and a part that is not there", () => {
    expect(
      asked({
        swellHeightMeters: {},
        swellPeriodSeconds: { min: undefined },
        windSpeedMetersPerSecond: undefined,
        tideTrend: "rising",
      }),
    ).toEqual({ tideTrend: "rising" });
  });

  it("keep an end at zero", () => {
    expect(asked({ swellHeightMeters: { min: 0 } })).toEqual({ swellHeightMeters: { min: 0 } });
  });

  it("are the same conditions in whatever order they come", () => {
    const one = { swellHeightMeters: { min: 1, max: 2 }, tideTrend: "rising" as const };
    const other = { tideTrend: "rising" as const, swellHeightMeters: { max: 2, min: 1 } };

    expect(conditionsKey(one)).toBe(conditionsKey(other));
    expect(conditionsKey(one)).toBe(conditionsKey({ ...one, swellPeriodSeconds: {} }));
    expect(conditionsKey(one)).not.toBe(conditionsKey({ ...one, tideTrend: "falling" }));
    expect(conditionsKey(one)).not.toBe(
      conditionsKey({ ...one, swellHeightMeters: { min: 1, max: 2.1 } }),
    );
  });
});

describe("a range set with its slider", () => {
  it("keeps exactly the end whose thumb did not move", () => {
    // Five metres a second are shown as ten knots, which are not quite five metres a second.
    const wind = { min: 5, max: 10 };
    const ends = sliderEnds("windSpeedMetersPerSecond", wind);
    const before = thumbsOf("windSpeedMetersPerSecond", wind, ends);
    expect(before).toEqual([10, 19]);

    const after = rangeAfter("windSpeedMetersPerSecond", wind, before, [10, 25], ends);
    expect(after?.min).toBe(5);
    expect(after?.max).toBeCloseTo(12.86, 2);
  });

  it("leaves a side open when its thumb goes to the end of the line", () => {
    const ends = sliderEnds("swellHeightMeters", { min: 1, max: 2 });
    const before = thumbsOf("swellHeightMeters", { min: 1, max: 2 }, ends);

    expect(rangeAfter("swellHeightMeters", { min: 1, max: 2 }, before, [1, 5], ends)).toEqual({
      min: 1,
    });
    expect(rangeAfter("swellHeightMeters", { min: 1 }, [1, 5], [0, 5], ends)).toBeUndefined();
  });

  it("holds an end that is kept past the usual ends of the line", () => {
    // Seven metres are more than the line usually shows.
    const swell = { min: 1, max: 7 };
    const ends = sliderEnds("swellHeightMeters", swell);
    expect(ends).toEqual([0, 7]);
    const before = thumbsOf("swellHeightMeters", swell, ends);

    // Moving the other thumb takes nothing from it.
    expect(rangeAfter("swellHeightMeters", swell, before, [1.5, 7], ends)).toEqual({
      min: 1.5,
      max: 7,
    });
  });

  it("holds a least that is more than the line usually shows, and a most that is less", () => {
    expect(sliderEnds("swellPeriodSeconds", { min: 30 })).toEqual([4, 30]);
    expect(thumbsOf("swellPeriodSeconds", { min: 30 }, [4, 30])).toEqual([30, 30]);
    expect(sliderEnds("tideHeightMeters", { max: -1 }, [0.5, 5])).toEqual([-1, 5]);
  });

  it("stops the end that moved at the one that did not, when their thumbs meet", () => {
    // 5.2 metres a second are shown as ten knots, and ten knots are kept as 5.14.
    const wind = { min: 5.2, max: 10 };
    const ends = sliderEnds("windSpeedMetersPerSecond", wind);
    const before = thumbsOf("windSpeedMetersPerSecond", wind, ends);

    expect(rangeAfter("windSpeedMetersPerSecond", wind, before, [10, 10], ends)).toEqual({
      min: 5.2,
      max: 5.2,
    });
  });

  it("runs over what the tide does at the spot, and further for an end kept beyond", () => {
    expect(sliderEnds("tideHeightMeters", undefined, [0.5, 5])).toEqual([0.5, 5]);
    expect(sliderEnds("tideHeightMeters", { min: -1, max: 6.2 }, [0.5, 5])).toEqual([-1, 6.2]);
  });
});

describe("a condition loosened by a notch", () => {
  const takes = (arc: { from: number; to: number }, degrees: number) =>
    arc.from <= arc.to
      ? degrees >= arc.from && degrees <= arc.to
      : degrees >= arc.from || degrees <= arc.to;

  it("still takes what it took, for a sector that passes north", () => {
    const before = { from: 330, to: 20 };
    const after = loosened(
      { windDirectionDegrees: before },
      "windDirectionDegrees",
    ).windDirectionDegrees!;

    expect(after).toEqual({ from: 315, to: 35 });
    for (const degrees of [330, 350, 0, 10, 20]) expect(takes(after, degrees)).toBe(true);
  });

  it("asks nothing any more once it would pass the whole compass", () => {
    expect(
      loosened({ swellDirectionDegrees: { from: 0, to: 350 } }, "swellDirectionDegrees"),
    ).toEqual({ swellDirectionDegrees: undefined });
  });

  it("never narrows a range, below zero as above", () => {
    const tide = loosened(
      { tideHeightMeters: { min: -2, max: 2 } },
      "tideHeightMeters",
    ).tideHeightMeters!;
    expect(tide.min).toBeLessThanOrEqual(-2);
    expect(tide.max).toBeGreaterThanOrEqual(2);
    expect(tide).toEqual({ min: -2.2, max: 2.2 });

    // A wind kept between two knots is not brought back to the knot above.
    const wind = loosened(
      { windSpeedMetersPerSecond: { max: 5 } },
      "windSpeedMetersPerSecond",
    ).windSpeedMetersPerSecond!;
    expect(wind.max).toBeGreaterThan(5);
  });

  it("stops at the least and the most the API takes", () => {
    expect(loosened({ swellPeriodSeconds: { min: 0, max: 40 } }, "swellPeriodSeconds")).toEqual({
      swellPeriodSeconds: { min: 0, max: 40 },
    });
    expect(loosened({ tideHeightMeters: { min: -5 } }, "tideHeightMeters")).toEqual({
      tideHeightMeters: { min: -5 },
    });
  });

  it("lets the tide go either way", () => {
    expect(loosened({ tideTrend: "rising" }, "tideTrend")).toEqual({ tideTrend: undefined });
  });
});

describe("what of a draft differs from the alert that is saved", () => {
  const saved: AlertDraft = {
    name: "The bay",
    criteria: { swellHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 120,
    spotIds: ["north", "south"],
  };

  it("is nothing for the same alert, written otherwise", () => {
    expect(samePart("name", " The bay ", "The bay")).toBe(true);
    expect(samePart("spotIds", ["south", "north"], ["north", "south"])).toBe(true);
    expect(
      changedParts(
        {
          name: "The bay ",
          criteria: { swellHeightMeters: { min: 1 }, tideHeightMeters: {} },
          enabled: true,
          spotIds: ["south", "north"],
        },
        saved,
      ),
    ).toEqual({});
  });

  it("is each part that was changed, and no other", () => {
    expect(changedParts({ name: "Dawn", enabled: true }, saved)).toEqual({ name: "Dawn" });
    expect(changedParts({ enabled: false, shortestMinutes: 120 }, saved)).toEqual({
      enabled: false,
    });
    expect(changedParts({ spotIds: ["north"] }, saved)).toEqual({ spotIds: ["north"] });
    expect(changedParts({ criteria: { swellHeightMeters: { min: 1.2 } } }, saved)).toEqual({
      criteria: { swellHeightMeters: { min: 1.2 } },
    });
  });
});

describe("what a save leaves of what was changed", () => {
  const sent: AlertDraft = {
    name: "Dawn",
    criteria: { swellHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 60,
    spotIds: ["north"],
  };

  it("is nothing when nothing was changed since it was sent", () => {
    expect(
      leftAfterSave(
        { name: " Dawn ", shortestMinutes: 60, criteria: { swellHeightMeters: { min: 1 } } },
        sent,
      ),
    ).toEqual({});
  });

  it("keeps a part that was changed again while its save was on its way", () => {
    // One hour was sent, and two were put back meanwhile: two is what was last chosen, whatever
    // the alert was seen to be in between.
    expect(leftAfterSave({ shortestMinutes: 120, name: "Dawn" }, sent)).toEqual({
      shortestMinutes: 120,
    });
    expect(leftAfterSave({ enabled: false }, sent)).toEqual({ enabled: false });
  });
});

describe("what was changed, once a neighbour is gone", () => {
  const isKnown = (spotId: string) => spotId !== "gone";

  it("no longer asks for a spot that is no longer the user's", () => {
    expect(withoutGone({ name: "Dawn", spotIds: ["north", "gone"] }, isKnown)).toEqual({
      name: "Dawn",
      spotIds: ["north"],
    });
  });

  it("is the same when none is gone, and when the spots were not changed", () => {
    const changed = { spotIds: ["north", "south"] };
    expect(withoutGone(changed, isKnown)).toBe(changed);
    const other = { shortestMinutes: 60 };
    expect(withoutGone(other, isKnown)).toBe(other);
  });
});

describe("a request to write something else in a spot's panel", () => {
  it("goes there at once when nothing is open, or nothing would be lost", () => {
    expect(leaveFor(null, { alertId: "bay" }, false)).toBe("go");
    expect(leaveFor({ alertId: "bay" }, { alertId: "big" }, false)).toBe("go");
    expect(leaveFor({ alertId: "bay" }, null, false)).toBe("go");
  });

  it("asks first when something was written that would be lost", () => {
    expect(leaveFor({ alertId: "bay" }, { alertId: "big" }, true)).toBe("ask");
    expect(leaveFor({ alertId: "bay" }, null, true)).toBe("ask");
    // A copy takes the place of what it is made from, and of a new alert that is not saved.
    expect(leaveFor({ alertId: "bay" }, { initial: {} as AlertDraft }, true)).toBe("ask");
    expect(leaveFor({}, {}, true)).toBe("ask");
  });

  it("leaves the alert that is open as it is when that alert is asked for", () => {
    expect(leaveFor({ alertId: "bay" }, { alertId: "bay" }, true)).toBe("stay");
    expect(leaveFor({ alertId: "bay" }, { alertId: "bay" }, false)).toBe("stay");
  });
});
