import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DENSITY,
  getDensity,
  lessDense,
  moreDense,
  setDensity,
  storedDensity,
} from "./density";

afterEach(() => {
  setDensity(DEFAULT_DENSITY);
  localStorage.clear();
});

describe("how much of the forecast a panel shows", () => {
  it("is everything until the reader chooses, and goes one step at a time", () => {
    expect(getDensity()).toBe("everything");
    expect(lessDense("details")).toBe("essentials");
    expect(moreDense("details")).toBe("everything");
    expect(lessDense("essentials")).toBeUndefined();
    expect(moreDense("everything")).toBeUndefined();
  });

  it("is kept in the browser, and read back only when it is one the app knows", () => {
    expect(storedDensity()).toBeUndefined();
    setDensity("essentials");
    expect(getDensity()).toBe("essentials");
    expect(storedDensity()).toBe("essentials");
    localStorage.setItem("tonnr:density", "expert");
    expect(storedDensity()).toBeUndefined();
  });
});
