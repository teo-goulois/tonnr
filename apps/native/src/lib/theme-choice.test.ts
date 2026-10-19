import { describe, expect, it } from "vitest";

import { THEME_CHOICES, themeChoiceOf } from "./theme-choice";

describe("the theme a person chose", () => {
  it("offers the three of the account's panel, the system's first", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
  });

  it("reads what was kept", () => {
    expect(themeChoiceOf("light")).toBe("light");
    expect(themeChoiceOf("dark")).toBe("dark");
    expect(themeChoiceOf("system")).toBe("system");
  });

  it("is the system's when nothing was kept, or what was kept names no theme", () => {
    expect(themeChoiceOf(null)).toBe("system");
    expect(themeChoiceOf(undefined)).toBe("system");
    expect(themeChoiceOf("sepia")).toBe("system");
    expect(themeChoiceOf("Dark")).toBe("system");
  });
});
