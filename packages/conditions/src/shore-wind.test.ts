import { describe, expect, it } from "vitest";

import { shoreWind } from "./shore-wind";

describe("shoreWind", () => {
  // A beach that faces west: the wind blows off it when it comes from the east.
  const offshoreFrom = 90;

  it("names a wind by the way it meets the shore", () => {
    expect(shoreWind(90, offshoreFrom)).toBe("offshore");
    expect(shoreWind(45, offshoreFrom)).toBe("cross_offshore");
    expect(shoreWind(135, offshoreFrom)).toBe("cross_offshore");
    expect(shoreWind(0, offshoreFrom)).toBe("cross_shore");
    expect(shoreWind(180, offshoreFrom)).toBe("cross_shore");
    expect(shoreWind(225, offshoreFrom)).toBe("cross_onshore");
    expect(shoreWind(315, offshoreFrom)).toBe("cross_onshore");
    expect(shoreWind(270, offshoreFrom)).toBe("onshore");
  });

  it("cuts the circle at 22.5° on each side of a name", () => {
    expect(shoreWind(112.5, offshoreFrom)).toBe("offshore");
    expect(shoreWind(113, offshoreFrom)).toBe("cross_offshore");
    expect(shoreWind(247, offshoreFrom)).toBe("cross_onshore");
    expect(shoreWind(248, offshoreFrom)).toBe("onshore");
  });

  it("reads across north, and bearings written past a full turn", () => {
    expect(shoreWind(350, 10)).toBe("offshore");
    expect(shoreWind(10, 350)).toBe("offshore");
    expect(shoreWind(190, 10)).toBe("onshore");
    expect(shoreWind(450, 90)).toBe("offshore");
    expect(shoreWind(-90, 90)).toBe("onshore");
  });
});
