import type { AlertCriteria } from "@repo/client/viewer/types";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_UNITS, setUnits } from "@/lib/units";

import { said, valuesOf } from "./condition-words";

afterEach(() => setUnits(DEFAULT_UNITS));

const criteria = {
  waveHeightMeters: { min: 1, max: 2 },
  wavePeakPeriodSeconds: { min: 9 },
  windDirectionDegrees: { from: 45, to: 135 },
  tideCycle: ["low"],
  or: { waveHeightMeters: [{ min: 3 }] },
} as unknown as AlertCriteria;

describe("what an account likes at a place, said as an alert's conditions are", () => {
  it("says each part something is asked of, in the order an alert says them", () => {
    const groups = valuesOf(criteria);
    expect(groups.map(([name]) => name)).toEqual(["Waves", "Wind", "Tide"]);
  });

  it("says a part's other values after its first, and a sector by its two ends", () => {
    const [waves, wind, tide] = valuesOf(criteria);
    expect(waves?.[1].map((values) => values.map(said))).toEqual([
      ["1–2 m", "3 m or more"],
      ["9 s or more"],
    ]);
    expect(wind?.[1].map((values) => values.map(said))).toEqual([["northeast–southeast"]]);
    expect(tide?.[1].map((values) => values.map(said))).toEqual([["low"]]);
  });

  it("says the heights in the unit its reader chose", () => {
    setUnits({ ...DEFAULT_UNITS, height: "ft" });
    const [waves] = valuesOf(criteria);
    expect(said(waves?.[1][0]?.[0] ?? { text: "" })).toMatch(/ft$/);
  });

  it("says nothing of conditions that ask nothing", () => {
    expect(valuesOf({} as AlertCriteria)).toEqual([]);
  });
});
