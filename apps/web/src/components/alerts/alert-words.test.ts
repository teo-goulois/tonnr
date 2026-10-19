import { describe, expect, it } from "vitest";

import {
  type AlertDraft,
  asked,
  changedParts,
  NOTHING_DRAFTED,
  afterAnswer,
  afterRead,
  afterSpotsRead,
  conditionsKey,
  coefficientWords,
  cycleWords,
  tideWords,
  isOpenAlert,
  isUnsaved,
  leftAfterSave,
  loosened,
  partsToSave,
  rangeAfter,
  rangeWords,
  samePart,
  setPart,
  sliderEnds,
  thumbsOf,
  withoutGone,
} from "./alert-words";

describe("the conditions as they are sent", () => {
  it("leave out a range with neither end and a part that is not there", () => {
    expect(
      asked({
        waveHeightMeters: {},
        wavePeakPeriodSeconds: { min: undefined },
        windSpeedMetersPerSecond: undefined,
        tideTrend: "rising",
      }),
    ).toEqual({ tideTrend: "rising" });
  });

  it("keep an end at zero", () => {
    expect(asked({ waveHeightMeters: { min: 0 } })).toEqual({ waveHeightMeters: { min: 0 } });
  });

  it("are the same conditions in whatever order they come", () => {
    const one = { waveHeightMeters: { min: 1, max: 2 }, tideTrend: "rising" as const };
    const other = { tideTrend: "rising" as const, waveHeightMeters: { max: 2, min: 1 } };

    expect(conditionsKey(one)).toBe(conditionsKey(other));
    expect(conditionsKey(one)).toBe(conditionsKey({ ...one, wavePeakPeriodSeconds: {} }));
    expect(conditionsKey(one)).not.toBe(conditionsKey({ ...one, tideTrend: "falling" }));
    expect(conditionsKey(one)).not.toBe(
      conditionsKey({ ...one, waveHeightMeters: { min: 1, max: 2.1 } }),
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
    const ends = sliderEnds("waveHeightMeters", { min: 1, max: 2 });
    const before = thumbsOf("waveHeightMeters", { min: 1, max: 2 }, ends);

    expect(rangeAfter("waveHeightMeters", { min: 1, max: 2 }, before, [1, 5], ends)).toEqual({
      min: 1,
    });
    expect(rangeAfter("waveHeightMeters", { min: 1 }, [1, 5], [0, 5], ends)).toBeUndefined();
  });

  it("holds an end that is kept past the usual ends of the line", () => {
    // Seven metres are more than the line usually shows.
    const swell = { min: 1, max: 7 };
    const ends = sliderEnds("waveHeightMeters", swell);
    expect(ends).toEqual([0, 7]);
    const before = thumbsOf("waveHeightMeters", swell, ends);

    // Moving the other thumb takes nothing from it.
    expect(rangeAfter("waveHeightMeters", swell, before, [1.5, 7], ends)).toEqual({
      min: 1.5,
      max: 7,
    });
  });

  it("holds a least that is more than the line usually shows, and a most that is less", () => {
    expect(sliderEnds("wavePeakPeriodSeconds", { min: 30 })).toEqual([4, 30]);
    expect(thumbsOf("wavePeakPeriodSeconds", { min: 30 }, [4, 30])).toEqual([30, 30]);
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
      loosened({ waveDirectionDegrees: { from: 0, to: 350 } }, "waveDirectionDegrees"),
    ).toEqual({ waveDirectionDegrees: undefined });
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
    expect(
      loosened({ wavePeakPeriodSeconds: { min: 0, max: 40 } }, "wavePeakPeriodSeconds"),
    ).toEqual({
      wavePeakPeriodSeconds: { min: 0, max: 40 },
    });
    expect(loosened({ tideHeightMeters: { min: -5 } }, "tideHeightMeters")).toEqual({
      tideHeightMeters: { min: -5 },
    });
  });

  it("lets the tide go either way", () => {
    expect(loosened({ tideTrend: "rising" }, "tideTrend")).toEqual({ tideTrend: undefined });
  });
});

describe("what an alert asks of the swell apart", () => {
  it("is said and loosened as what it asks of the whole sea is", () => {
    expect(rangeWords("primarySwellHeightMeters", { min: 0.8 })).toBe(
      rangeWords("waveHeightMeters", { min: 0.8 }),
    );
    // A height by two tenths, and a sector by a notch at each end.
    expect(
      loosened({ primarySwellHeightMeters: { min: 0.8 } }, "primarySwellHeightMeters"),
    ).toEqual({ primarySwellHeightMeters: { min: 0.6 } });
    const { waveDirectionDegrees: waves } = loosened(
      { waveDirectionDegrees: { from: 250, to: 310 } },
      "waveDirectionDegrees",
    );
    const { primarySwellDirectionDegrees: swell } = loosened(
      { primarySwellDirectionDegrees: { from: 250, to: 310 } },
      "primarySwellDirectionDegrees",
    );
    expect(swell).toEqual(waves);
  });

  it("is sent with the rest, and left out when nothing is asked of it", () => {
    expect(
      asked({
        waveHeightMeters: { min: 1 },
        primarySwellHeightMeters: { min: 0.8 },
        primarySwellDirectionDegrees: undefined,
      }),
    ).toEqual({ waveHeightMeters: { min: 1 }, primarySwellHeightMeters: { min: 0.8 } });
    expect(asked({ primarySwellHeightMeters: {} })).toEqual({});
  });
});

describe("what of a draft differs from the alert that is saved", () => {
  const saved: AlertDraft = {
    name: "The bay",
    criteria: { waveHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 120,
    spotIds: ["north", "south"],
    breakIds: [],
  };

  it("is nothing for the same alert, written otherwise", () => {
    expect(samePart("name", " The bay ", "The bay")).toBe(true);
    expect(samePart("spotIds", ["south", "north"], ["north", "south"])).toBe(true);
    expect(
      changedParts(
        {
          name: "The bay ",
          criteria: { waveHeightMeters: { min: 1 }, tideHeightMeters: {} },
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
    expect(changedParts({ criteria: { waveHeightMeters: { min: 1.2 } } }, saved)).toEqual({
      criteria: { waveHeightMeters: { min: 1.2 } },
    });
  });
});

describe("what a save leaves of what was changed", () => {
  it("is nothing when nothing was changed since it was sent", () => {
    expect(
      leftAfterSave(
        { name: " Dawn ", shortestMinutes: 60, criteria: { waveHeightMeters: { min: 1 } } },
        { name: "Dawn", shortestMinutes: 60, criteria: { waveHeightMeters: { min: 1 } } },
      ),
    ).toEqual({});
  });

  it("keeps a part that was changed again while its save was on its way", () => {
    expect(leftAfterSave({ shortestMinutes: 120, name: "Dawn" }, { shortestMinutes: 60 })).toEqual({
      shortestMinutes: 120,
      name: "Dawn",
    });
  });

  it("keeps a part that the save did not send, whatever it says", () => {
    expect(leftAfterSave({ enabled: true, name: "Dawn" }, { name: "Dawn" })).toEqual({
      enabled: true,
    });
  });
});

describe("what an editor holds of an alert between two saves", () => {
  const saved: AlertDraft = {
    name: "The bay",
    criteria: { waveHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 120,
    spotIds: ["north"],
    breakIds: [],
  };
  const sending = (drafting: typeof NOTHING_DRAFTED, sent: Partial<AlertDraft>) => ({
    ...drafting,
    sending: sent,
  });

  it("no longer holds a part that is put back to what the alert says", () => {
    const off = setPart(NOTHING_DRAFTED, saved, "enabled", false);
    expect(off.changed).toEqual({ enabled: false });
    const on = setPart(off, saved, "enabled", true);
    expect(on.changed).toEqual({});
    // So the alert is followed again: switched off elsewhere, it is off here, and a later save
    // of its name sends its name alone.
    const elsewhere = { ...saved, enabled: false };
    const named = setPart(afterRead(on, elsewhere), elsewhere, "name", "Dawn");
    expect(partsToSave(named, elsewhere)).toEqual({ name: "Dawn" });
  });

  it("lets go of a part once the alert says the same elsewhere", () => {
    const off = setPart(NOTHING_DRAFTED, saved, "enabled", false);
    expect(afterRead(off, { ...saved, enabled: false }).changed).toEqual({});
    // And keeps the same hold when nothing was let go of.
    expect(afterRead(off, saved)).toBe(off);
  });

  it("keeps what is put back while a save is on its way, whatever is read meanwhile", () => {
    // One hour is sent, and two are put back before the answer.
    const sent = { shortestMinutes: 60 };
    const one = sending(setPart(NOTHING_DRAFTED, saved, "shortestMinutes", 60), sent);
    const two = setPart(one, saved, "shortestMinutes", 120);
    expect(two.changed).toEqual({ shortestMinutes: 120 });
    // It would be lost by leaving: the save will have stored one hour.
    expect(isUnsaved(two, saved)).toBe(true);
    // The alert is read again as it still is, by a refresh that has nothing to do with it.
    expect(afterRead(two, { ...saved })).toBe(two);

    const answered = afterAnswer(two, sent, { ...saved, shortestMinutes: 60 });
    expect(answered).toEqual({ changed: { shortestMinutes: 120 }, sending: null });
    expect(partsToSave(answered, { ...saved, shortestMinutes: 60 })).toEqual({
      shortestMinutes: 120,
    });
  });

  it("keeps a part that a save did not send, changed while that save was on its way", () => {
    // The name is sent. The alert is switched off elsewhere, and on again here, before the
    // answer, which comes with the alert off.
    const sent = { name: "Dawn" };
    const named = sending(setPart(NOTHING_DRAFTED, saved, "name", "Dawn"), sent);
    const off = { ...saved, enabled: false };
    const on = setPart(afterRead(named, off), off, "enabled", true);

    const answered = afterAnswer(on, sent, { ...off, name: "Dawn" });
    expect(answered).toEqual({ changed: { enabled: true }, sending: null });
  });

  it("lets go at once of a part put back while a save of another part is on its way", () => {
    // The name is on its way. The switch is put off and on again: it is no longer a change,
    // whatever the name's save does. Switched off elsewhere, the alert is off here, and the
    // answer leaves nothing to send.
    const sent = { name: "Dawn" };
    const named = sending(setPart(NOTHING_DRAFTED, saved, "name", "Dawn"), sent);
    const off = setPart(named, saved, "enabled", false);
    const on = setPart(off, saved, "enabled", true);
    expect(on.changed).toEqual({ name: "Dawn" });

    const elsewhere = { ...saved, enabled: false, name: "Dawn" };
    const answered = afterAnswer(afterRead(on, { ...saved, enabled: false }), sent, elsewhere);
    expect(answered).toEqual(NOTHING_DRAFTED);
  });

  it("lets go of a part that says what the alert answered with, though no save sent it", () => {
    // Switched off here while the name is on its way, and switched off elsewhere meanwhile:
    // the answer comes with the alert off, as it was set here.
    const sent = { name: "Dawn" };
    const named = sending(setPart(NOTHING_DRAFTED, saved, "name", "Dawn"), sent);
    const off = setPart(named, saved, "enabled", false);
    expect(off.changed).toEqual({ name: "Dawn", enabled: false });

    expect(afterAnswer(off, sent, { ...saved, name: "Dawn", enabled: false })).toEqual(
      NOTHING_DRAFTED,
    );
  });

  it("holds nothing once a save has answered with all that was written", () => {
    const sent = { name: "Dawn", shortestMinutes: 60 };
    const written = sending(
      setPart(setPart(NOTHING_DRAFTED, saved, "name", "Dawn"), saved, "shortestMinutes", 60),
      sent,
    );
    // Until the save has answered, what it sent is not saved: leaving would lose it were the
    // save to fail.
    expect(isUnsaved(written, saved)).toBe(true);
    const done = afterAnswer(written, sent, { ...saved, ...sent });
    expect(done).toEqual(NOTHING_DRAFTED);
    expect(isUnsaved(done, { ...saved, ...sent })).toBe(false);
  });

  it("keeps everything when the save failed", () => {
    const sent = { name: "Dawn" };
    const written = sending(setPart(NOTHING_DRAFTED, saved, "name", "Dawn"), sent);

    const failed = afterAnswer(written, sent, undefined);
    expect(failed).toEqual({ changed: { name: "Dawn" }, sending: null });
    expect(partsToSave(failed, saved)).toEqual({ name: "Dawn" });
    expect(isUnsaved(failed, saved)).toBe(true);
  });

  it("counts a name written on a new alert that asks nothing yet", () => {
    const fresh: AlertDraft = { ...saved, name: "North", criteria: {} };
    expect(isUnsaved(NOTHING_DRAFTED, fresh)).toBe(false);
    expect(isUnsaved(setPart(NOTHING_DRAFTED, fresh, "name", "Dawn"), fresh)).toBe(true);
  });

  it("follows a new alert once it is saved whole, and keeps what was written meanwhile", () => {
    const fresh: AlertDraft = { ...saved, name: "North", criteria: {} };
    const whole = { ...fresh, criteria: { waveHeightMeters: { min: 1 } } };
    const asked = sending(setPart(NOTHING_DRAFTED, fresh, "criteria", whole.criteria), whole);
    const renamed = setPart(asked, fresh, "name", "Dawn");

    expect(afterAnswer(renamed, whole, whole)).toEqual({
      changed: { name: "Dawn" },
      sending: null,
    });
  });
});

describe("what was changed, once a neighbour is gone", () => {
  const isKnown = (spotId: string) => spotId !== "gone";
  const written: AlertDraft = {
    name: "The bay",
    criteria: { waveHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 120,
    spotIds: ["north", "south"],
    breakIds: [],
  };

  it("no longer asks for a spot that is no longer the user's", () => {
    for (const isSaved of [true, false]) {
      expect(
        withoutGone({ name: "Dawn", spotIds: ["north", "gone"] }, written, isKnown, isSaved),
      ).toEqual({ name: "Dawn", spotIds: ["north"] });
    }
  });

  it("takes it out of the spots a new alert starts with, as a copy's before it is touched", () => {
    expect(withoutGone({}, { ...written, spotIds: ["north", "gone"] }, isKnown, false)).toEqual({
      spotIds: ["north"],
    });
  });

  it("makes no change of the spots of a saved alert that were not changed here", () => {
    // The alert says itself what its spots are once it is read again: with a spot added on
    // another device meanwhile, a change made here for it would take that spot out again.
    const changed = { name: "Dawn" };
    expect(withoutGone(changed, { ...written, spotIds: ["north", "gone"] }, isKnown, true)).toBe(
      changed,
    );
  });

  it("is the same when none is gone", () => {
    const changed = { spotIds: ["north", "south"] };
    expect(withoutGone(changed, written, isKnown, false)).toBe(changed);
    const other = { shortestMinutes: 60 };
    expect(withoutGone(other, written, isKnown, false)).toBe(other);
  });
});

describe("the spots that were written, once the user's spots are read again", () => {
  const saved: AlertDraft = {
    name: "The bay",
    criteria: { waveHeightMeters: { min: 1 } },
    enabled: true,
    shortestMinutes: 120,
    spotIds: ["north"],
    breakIds: [],
  };

  it("follow the alert again when what is left of them is what the alert has", () => {
    // A neighbour is added here, and deleted elsewhere before it is saved.
    const added = setPart(NOTHING_DRAFTED, saved, "spotIds", ["north", "gone"]);
    const pruned = afterSpotsRead(added, saved, (spotId) => spotId !== "gone", true);
    expect(pruned).toEqual(NOTHING_DRAFTED);
    // So a spot that another device adds to the alert is not taken out by the next save.
    const elsewhere = { ...saved, spotIds: ["north", "south"] };
    const named = setPart(afterRead(pruned, elsewhere), elsewhere, "name", "Dawn");
    expect(partsToSave(named, elsewhere)).toEqual({ name: "Dawn" });
  });

  it("stay a change when what is left of them is not what the alert has", () => {
    const added = setPart(NOTHING_DRAFTED, saved, "spotIds", ["north", "south", "gone"]);
    expect(afterSpotsRead(added, saved, (spotId) => spotId !== "gone", true).changed).toEqual({
      spotIds: ["north", "south"],
    });
  });

  it("are kept while the save that sent them is on its way", () => {
    const sent = { spotIds: ["north", "gone"] };
    const sending = { ...setPart(NOTHING_DRAFTED, saved, "spotIds", sent.spotIds), sending: sent };
    expect(afterSpotsRead(sending, saved, (spotId) => spotId !== "gone", true).changed).toEqual({
      spotIds: ["north"],
    });
  });
});

describe("what a spot's panel is asked to write", () => {
  it("is the alert that is open when it names that alert", () => {
    expect(isOpenAlert({ alertId: "bay" }, { alertId: "bay" })).toBe(true);
  });

  it("is something else for another alert, a new one, a copy, or the list", () => {
    expect(isOpenAlert({ alertId: "bay" }, { alertId: "big" })).toBe(false);
    expect(isOpenAlert({ alertId: "bay" }, {})).toBe(false);
    expect(isOpenAlert({ alertId: "bay" }, { initial: {} as AlertDraft })).toBe(false);
    expect(isOpenAlert({ alertId: "bay" }, null)).toBe(false);
    // A new alert that is being written is not the one a second new alert asks for.
    expect(isOpenAlert({}, {})).toBe(false);
    expect(isOpenAlert(null, { alertId: "bay" })).toBe(false);
  });
});

describe("the tide, said", () => {
  it("says the parts of the cycle in runs, by their ends", () => {
    expect(cycleWords(["mid_rising", "mid_high_rising", "high"])).toBe(
      "from mid tide rising to high",
    );
    // A run across low water stays whole.
    expect(cycleWords(["mid_low_falling", "low", "mid_low_rising", "high"])).toBe(
      "from late falling to early rising or high",
    );
    expect(cycleWords([])).toBeUndefined();
  });

  it("says the bands of the coefficient in figures", () => {
    expect(coefficientWords(["big", "small"])).toBe("coef < 70 or > 90");
    expect(coefficientWords(["small", "medium", "big"])).toBeUndefined();
  });

  it("says the cycle, the coefficient, and the height of an older alert", () => {
    expect(tideWords({ tideCycle: ["low"], tideCoefficients: ["big"] })).toBe("low, coef > 90");
    expect(tideWords({ tideTrend: "rising" })).toBe("rising");
  });
});

describe("a part with other values", () => {
  it("is the same conditions whatever the order of their keys", () => {
    expect(
      conditionsKey({
        waveHeightMeters: { min: 1 },
        or: { waveHeightMeters: [{ max: 3, min: 2 }] },
      }),
    ).toBe(
      conditionsKey({
        or: { waveHeightMeters: [{ min: 2, max: 3 }] },
        waveHeightMeters: { min: 1 },
      }),
    );
  });

  it("is loosened in each of its values", () => {
    expect(
      loosened(
        { wavePeakPeriodSeconds: { min: 10 }, or: { wavePeakPeriodSeconds: [{ max: 6 }] } },
        "wavePeakPeriodSeconds",
      ),
    ).toEqual({ wavePeakPeriodSeconds: { min: 9 }, or: { wavePeakPeriodSeconds: [{ max: 7 }] } });
  });

  it("asks nothing of the tide once the cycle is loosened", () => {
    expect(
      loosened(
        {
          tideCycle: ["low"],
          waveHeightMeters: { min: 1 },
          or: { tide: [{ tideCycle: ["high"] }] },
        },
        "tideCycle",
      ),
    ).toEqual({ waveHeightMeters: { min: 1 } });
  });
});
