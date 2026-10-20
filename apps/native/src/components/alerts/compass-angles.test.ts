import { shoreWind } from "@repo/conditions/shore-wind";
import { describe, expect, it } from "vitest";

import {
  bearingOf,
  nearestEnd,
  onStep,
  sameArc,
  shoreSectors,
  turnBetween,
  turned,
} from "./compass-angles";

describe("the angles of the compass", () => {
  it("reads where a finger points, clockwise from north", () => {
    expect(bearingOf(0, -10)).toBe(0);
    expect(bearingOf(10, 0)).toBe(90);
    expect(bearingOf(0, 10)).toBe(180);
    expect(bearingOf(-10, 0)).toBe(270);
  });

  it("brings a handle to a step", () => {
    expect(onStep(247)).toBe(245);
    expect(onStep(358)).toBe(0);
    expect(onStep(-3)).toBe(355);
  });

  it("gives a press the nearer end, across north too", () => {
    expect(nearestEnd({ from: 250, to: 310 }, 260)).toBe("from");
    expect(nearestEnd({ from: 250, to: 310 }, 330)).toBe("to");
    expect(nearestEnd({ from: 350, to: 30 }, 5)).toBe("from");
  });

  it("turns a sector whole, the short way round", () => {
    expect(turned({ from: 350, to: 30 }, 20)).toEqual({ from: 10, to: 50 });
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
  });

  it("says each shore's sectors as `shoreWind` reads them", () => {
    const offshore = 100;
    const sectors = shoreSectors(offshore);

    expect(shoreWind(sectors.offshore.from, offshore)).toBe("offshore");
    expect(shoreWind(sectors.offshore.to, offshore)).toBe("offshore");
    expect(shoreWind(sectors.crossOffshore.from, offshore)).toBe("cross_offshore");
    expect(shoreWind(sectors.crossShore.to, offshore)).toBe("cross_shore");
    expect(shoreSectors(10).crossShore).toEqual({ from: 258, to: 122 });
    expect(sameArc(sectors.offshore, { from: 78, to: 122 })).toBe(true);
    expect(sameArc(sectors.offshore, undefined)).toBe(false);
  });
});
