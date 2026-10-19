import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_DENSITY, getDensity, setDensity, storedDensity } from "./density";

// The densities and their order are tested in packages/client: here, what the browser holds in
// force and keeps.
afterEach(() => {
  setDensity(DEFAULT_DENSITY);
  localStorage.clear();
});

describe("how much of the forecast a panel shows", () => {
  it("is everything until the reader chooses", () => {
    expect(getDensity()).toBe("everything");
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
