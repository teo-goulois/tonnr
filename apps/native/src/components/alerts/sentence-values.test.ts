import { describe, expect, it } from "vitest";

import { saidValues } from "./sentence-values";

// Where an alert's sentence stands its "+" and its "×", as the web's editor: decision 031, "The
// editor".

describe("the values a sentence says of a part", () => {
  it("offers no '+' while the part's own value asks nothing", () => {
    expect(saidValues({}, "waveHeightMeters")).toEqual({ others: [], canAdd: false, adds: 1 });
  });

  it("offers a '+' after a value that asks something", () => {
    expect(saidValues({ waveHeightMeters: { min: 1, max: 2 } }, "waveHeightMeters")).toEqual({
      others: [],
      canAdd: true,
      adds: 1,
    });
  });

  it("says each other value that asks something, and adds after the last", () => {
    const criteria = {
      waveHeightMeters: { min: 1, max: 2 },
      or: { waveHeightMeters: [{ min: 3 }, { min: 5 }] },
    };
    expect(saidValues(criteria, "waveHeightMeters")).toEqual({
      others: [1, 2],
      canAdd: true,
      adds: 3,
    });
  });

  it("says nothing of an other value still to choose", () => {
    const criteria = {
      windDirectionDegrees: { from: 45, to: 135 },
      or: { waveHeightMeters: [{}], windDirectionDegrees: [{ from: 200, to: 260 }] },
      waveHeightMeters: { min: 1 },
    };
    expect(saidValues(criteria, "waveHeightMeters")).toEqual({
      others: [],
      canAdd: true,
      adds: 2,
    });
    expect(saidValues(criteria, "windDirectionDegrees")).toEqual({
      others: [1],
      canAdd: true,
      adds: 2,
    });
  });

  it("offers no '+' once a part holds as many other values as it may", () => {
    const criteria = {
      waveHeightMeters: { min: 1 },
      or: { waveHeightMeters: [{ min: 2 }, { min: 3 }, { min: 4 }] },
    };
    expect(saidValues(criteria, "waveHeightMeters")).toEqual({
      others: [1, 2, 3],
      canAdd: false,
      adds: 4,
    });
  });
});
