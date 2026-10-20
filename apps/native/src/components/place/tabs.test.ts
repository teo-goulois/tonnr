import { describe, expect, it } from "vitest";

import { FOLD_HIGHEST, FOLD_LOWEST, FOLD_NONE, isWorthMoving, lowDetent } from "./fold";
import { isPlaceKind, tabFrom, tabsOf } from "./tabs";

describe("the tabs of a place", () => {
  it("gives a station its forecast alone", () => {
    expect(tabsOf({ kind: "station", signedIn: true, isOwner: false })).toEqual(["forecast"]);
  });

  it("gives a break its alerts for an account only", () => {
    expect(tabsOf({ kind: "break", signedIn: false, isOwner: false })).toEqual([
      "forecast",
      "reports",
      "guide",
      "sessions",
    ]);
    expect(tabsOf({ kind: "break", signedIn: true, isOwner: false })).toContain("alerts");
  });

  it("gives a spot read in a shared list its forecast and its guide", () => {
    expect(tabsOf({ kind: "spot", signedIn: true, isOwner: false })).toEqual(["forecast", "guide"]);
    expect(tabsOf({ kind: "spot", signedIn: true, isOwner: true })).toEqual([
      "forecast",
      "guide",
      "alerts",
      "sessions",
    ]);
  });

  it("opens the tab an address asks for when the place has it, the web's names too", () => {
    const tabs = tabsOf({ kind: "break", signedIn: true, isOwner: false });
    expect(tabFrom("reports", tabs)).toBe("reports");
    expect(tabFrom("alert", tabs)).toBe("alerts");
    expect(tabFrom("alerts", ["forecast"])).toBe("forecast");
    expect(tabFrom(undefined, tabs)).toBe("forecast");
  });

  it("knows the kinds of place an address names", () => {
    expect(isPlaceKind("break")).toBe(true);
    expect(isPlaceKind("buoy")).toBe(false);
  });
});

describe("the low height of a place's sheet", () => {
  it("is as tall as its summary, within the screen's bounds", () => {
    expect(lowDetent(400, 1000)).toBe(0.4);
    expect(lowDetent(100, 1000)).toBe(FOLD_LOWEST);
    expect(lowDetent(900, 1000)).toBe(FOLD_HIGHEST);
    expect(lowDetent(undefined, 1000)).toBe(FOLD_NONE);
    expect(lowDetent(401, 1000)).toBe(0.41);
  });

  it("moves the sheet for no change of a few points", () => {
    expect(isWorthMoving(0.45, 0.46)).toBe(false);
    expect(isWorthMoving(0.45, 0.4)).toBe(true);
  });
});
