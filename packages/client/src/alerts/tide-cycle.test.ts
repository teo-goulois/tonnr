import { TIDE_CYCLE } from "@repo/config/sea-words";
import { describe, expect, it } from "vitest";

import { TIDE_CURVE, TIDE_SPANS, tidePath } from "./tide-cycle";

describe("the curve of one tide", () => {
  it("gives each part of the cycle its stretches, end to end, from low water to low water", () => {
    const stretches = TIDE_CYCLE.flatMap((segment) => TIDE_SPANS[segment])
      .sort((one, other) => one[0] - other[0])
      .flat();

    expect(stretches[0]).toBe(0);
    expect(stretches.at(-1)).toBe(1);
    // Each stretch ends where the next begins: the curve has no gap and no overlap.
    for (let index = 1; index < stretches.length - 1; index += 2) {
      expect(stretches[index]).toBeCloseTo(stretches[index + 1] ?? Number.NaN);
    }
  });

  it("draws high water at the top and low water at the bottom", () => {
    const [high] = TIDE_SPANS.high;
    const path = tidePath(high ?? [0, 0]);
    const middle = tidePath([0.5, 0.5]);

    expect(path.startsWith("M")).toBe(true);
    expect(middle.split("L")[0]).toBe("M150.0,14.0");
    expect(tidePath([0, 0]).split("L")[0]).toBe("M0.0,76.0");
    expect(TIDE_CURVE.top).toBeLessThan(TIDE_CURVE.bottom);
  });
});
