import { describe, expect, it } from "vitest";

import { DEFAULT_DENSITY, densityName, isDensity, lessDense, moreDense } from "./density";
import { ENGLISH } from "./testing";

describe("how much of the forecast a panel shows", () => {
  it("is everything until the reader chooses, and goes one step at a time", () => {
    expect(DEFAULT_DENSITY).toBe("everything");
    expect(lessDense("details")).toBe("essentials");
    expect(moreDense("details")).toBe("everything");
    expect(lessDense("essentials")).toBeUndefined();
    expect(moreDense("everything")).toBeUndefined();
  });

  it("is read back only when it is one the app knows", () => {
    expect(isDensity("essentials")).toBe(true);
    expect(isDensity("expert")).toBe(false);
    expect(isDensity(null)).toBe(false);
  });

  it("is named by the app's messages", () => {
    expect(densityName("essentials", ENGLISH)).toBe("Simple");
    expect(densityName("everything", ENGLISH)).toBe("Complete");
  });
});
