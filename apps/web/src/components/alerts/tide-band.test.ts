import { describe, expect, it } from "vitest";

import { tideAhead } from "./tide-band";

const HOUR_MS = 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 10, 6);
const at = (hours: number) => START + hours * HOUR_MS;
describe("what the editor draws of the tide", () => {
  it("draws from now, over two days", () => {
    const week = Array.from({ length: 24 * 7 }, (_, hour) => ({
      time: new Date(at(hour)),
      value: hour % 12,
    }));
    const drawn = tideAhead(week, at(24));

    expect(drawn[0]?.time.getTime()).toBe(at(24));
    expect(drawn.at(-1)?.time.getTime()).toBe(at(24 + 48));
  });
});
