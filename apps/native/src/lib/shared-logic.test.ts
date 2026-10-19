import { readdirSync } from "node:fs";

import { formatting } from "@repo/client/format";
import { PHONE_TABS } from "@repo/client/phone-nav";
import { DEFAULT_UNITS, unitWriting } from "@repo/client/units";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/paraglide/messages";
import { baseLocale, getLocale, setLocale } from "@/paraglide/runtime.js";

// The rules the app shares with the web app come from packages/client, written with the app's
// own messages, which are the web's: decision 069.
const format = formatting({ locale: () => getLocale(), m });
const writing = unitWriting({ units: () => DEFAULT_UNITS, formatNumber: format.formatNumber, m });

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("what the app shares with the web app", () => {
  it("has the tabs of decision 040 for its screens, the map at the start and the + aside", () => {
    const screens = readdirSync(new URL("../app/(tabs)", import.meta.url))
      .map((file) => file.replace(/\.tsx$/, ""))
      .filter((screen) => screen !== "_layout" && screen !== "add")
      .map((screen) => (screen === "index" ? "map" : screen));

    expect(screens.toSorted()).toEqual([...PHONE_TABS].toSorted());
  });

  it("writes a measurement in the language the app is set to", () => {
    expect(writing.formatWind(12.4)).toBe("12 kn");
    expect(format.compassPoint(292)).toBe("WNW");

    void setLocale("fr", { reload: false });

    expect(writing.formatWind(12.4)).toBe("12 nd");
    expect(format.compassPoint(292)).toBe("ONO");
  });
});
