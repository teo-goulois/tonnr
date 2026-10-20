import { describe, expect, it } from "vitest";

import type { Sample } from "./metrics";
import { LIVE_REACH, nowOf, seaNowOf } from "./now";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12);

function sample(time: number, values: Partial<Sample>): Sample {
  return {
    time,
    height: null,
    period: null,
    energy: null,
    wind: null,
    gust: null,
    windDirection: null,
    waveDirection: null,
    swell: null,
    swellDirection: null,
    cloud: null,
    rain: null,
    air: null,
    ...values,
  };
}

const model = [
  sample(NOW - HOUR, { height: 1, waveDirection: 280, wind: 10, windDirection: 90 }),
  sample(NOW + HOUR, { height: 2, waveDirection: 290, wind: 12, windDirection: 100 }),
];

describe("what a tile reads now", () => {
  it("reads the buoy's last reading while it is recent, and the model at that moment beside it", () => {
    const measured = [sample(NOW - HOUR, { height: 1.4, waveDirection: 300 })];
    const read = nowOf(
      { key: "height", direction: "waveDirection" },
      { measured, model, now: NOW },
    );
    expect(read.measured).toBe(1.4);
    expect(read.shown).toBe(1.4);
    expect(read.model).toBe(1);
    expect(read.bearing).toBe(300);
  });

  it("reads the model now once the buoy's reading is too old", () => {
    const measured = [sample(NOW - LIVE_REACH - HOUR, { height: 1.4 })];
    const read = nowOf(
      { key: "height", direction: "waveDirection" },
      { measured, model, now: NOW },
    );
    expect(read.measured).toBeUndefined();
    expect(read.shown).toBe(1.5);
    expect(read.bearing).toBeDefined();
  });
});

describe("the sea now in a sentence", () => {
  it("says the waves and the wind, judges nothing at a place without words, and has no tide where none is known", () => {
    const facts = seaNowOf(
      { measured: [], model, now: NOW },
      { offshoreFrom: null, words: null, tides: undefined, extremes: undefined },
    );
    expect(facts.waves.height).toBe(1.5);
    expect(facts.wind.knots).toBe(11);
    expect(facts.wind.atShore).toBeNull();
    expect(facts.tide).toBeNull();
    expect(facts.verdict).toBeNull();
  });

  it("names the wind by the shore where the place knows it", () => {
    // The wind comes from 90° to 100°, and the shore's offshore wind from the east.
    const facts = seaNowOf(
      { measured: [], model, now: NOW },
      { offshoreFrom: 95, words: null, tides: undefined, extremes: undefined },
    );
    expect(facts.wind.atShore).toBe("offshore");
  });
});
