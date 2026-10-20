import { afterEach, describe, expect, it } from "vitest";

import { baseLocale, setLocale } from "@/paraglide/runtime.js";

import { partLabel, partSaid } from "./part-words";

// What each part of an alert's sentence says, in the web's words: decision 031, "The editor".

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("the words of a part", () => {
  const criteria = {
    waveHeightMeters: { min: 1, max: 2 },
    windDirectionDegrees: { from: 45, to: 135 },
    tideCycle: ["low" as const, "mid_low_rising" as const],
    or: { waveHeightMeters: [{ min: 3 }] },
  };

  it("says a part's own value with its verb, and an other value alone", () => {
    expect(partSaid(criteria, "waveHeightMeters", 0)).toMatchObject({
      words: "are 1–2 m",
      value: "1–2 m",
      isSet: true,
    });
    expect(partSaid(criteria, "waveHeightMeters", 1)).toMatchObject({
      words: "3 m or more",
      isSet: true,
    });
  });

  it("says what a part asks nothing of, and an other value still to choose", () => {
    expect(partSaid(criteria, "wavePeakPeriodSeconds", 0)).toMatchObject({
      words: "with any period",
      value: "Any",
      isSet: false,
    });
    expect(partSaid(criteria, "waveHeightMeters", 2).words).toBe("to choose");
  });

  it("writes a direction as an arrow and the point it comes from, and speaks it in words", () => {
    const said = partSaid(criteria, "windDirectionDegrees", 0);

    // An arrow keeps to its point by a thin space.
    expect(said.words).toBe("from ↙\u2009NE–↖\u2009SE");
    expect(said.spoken).toBe("from northeast – southeast");
    expect(said.value).toBe("NE–SE · 45°–135°");
  });

  it("says the tide by the parts of its cycle", () => {
    expect(partSaid(criteria, "tide", 0)).toMatchObject({
      words: "from low to early rising",
      isSet: true,
    });
    expect(partSaid({}, "tide", 0).words).toBe("at any stage");
  });

  it("names each part in the language the app is set to", () => {
    expect(partLabel("shortest")).toBe("The shortest window worth telling");
    void setLocale("fr", { reload: false });
    expect(partSaid(criteria, "wavePeakPeriodSeconds", 0).value).toBe("Peu importe");
  });
});
