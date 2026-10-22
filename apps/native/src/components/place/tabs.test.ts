import { describe, expect, it } from "vitest";

import {
  FOLD_HIGHEST,
  FOLD_LOWEST,
  FOLD_NONE,
  isWorthMoving,
  largestSheet,
  lowDetent,
  RAISED,
  sheetDetentOf,
} from "./fold";
import { isPlaceKind, tabFrom, tabsOf } from "./tabs";

describe("the tabs of a place", () => {
  it("gives a station its forecast alone", () => {
    expect(tabsOf({ kind: "station", signedIn: true, isOwner: false, known: true })).toEqual([
      "forecast",
    ]);
  });

  it("gives a break its alerts for an account only", () => {
    expect(tabsOf({ kind: "break", signedIn: false, isOwner: false, known: true })).toEqual([
      "forecast",
      "reports",
      "guide",
      "sessions",
    ]);
    expect(tabsOf({ kind: "break", signedIn: true, isOwner: false, known: true })).toContain(
      "alerts",
    );
  });

  it("gives a spot read in a shared list its forecast and its guide", () => {
    expect(tabsOf({ kind: "spot", signedIn: true, isOwner: false, known: true })).toEqual([
      "forecast",
      "guide",
    ]);
    expect(tabsOf({ kind: "spot", signedIn: true, isOwner: true, known: true })).toEqual([
      "forecast",
      "guide",
      "alerts",
      "sessions",
    ]);
  });

  it("gives a break or a spot its forecast alone until it is read, and once it is gone", () => {
    expect(tabsOf({ kind: "break", signedIn: true, isOwner: false, known: false })).toEqual([
      "forecast",
    ]);
    expect(tabsOf({ kind: "spot", signedIn: true, isOwner: false, known: false })).toEqual([
      "forecast",
    ]);
  });

  it("opens the tab an address asks for when the place has it, the web's names too", () => {
    const tabs = tabsOf({ kind: "break", signedIn: true, isOwner: false, known: true });
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
    expect(lowDetent(400, 1000, 1000)).toBe(0.4);
    expect(lowDetent(100, 1000, 1000)).toBe(FOLD_LOWEST);
    expect(lowDetent(900, 1000, 1000)).toBe(FOLD_HIGHEST);
    expect(lowDetent(undefined, 1000, 1000)).toBe(FOLD_NONE);
    expect(lowDetent(401, 1000, 1000)).toBe(0.41);
  });

  it("is a share of the largest sheet, which the platform measures it against", () => {
    // An iPhone of 852 points with 59 of them over the safe area: a summary that ends 400 points
    // under the sheet's top takes more than 47 hundredths of the screen's height.
    const largest = largestSheet(852, 59, true);
    expect(largest).toBe(783);
    expect(lowDetent(400, 852, largest)).toBe(0.52);
    expect(lowDetent(400, 852, largest) * largest).toBeGreaterThanOrEqual(400);
    // Its bounds stay shares of the screen.
    expect(lowDetent(100, 852, largest) * largest).toBeGreaterThanOrEqual(0.3 * 852);
    expect(largestSheet(852, 40, false)).toBe(812);
  });

  it("never reaches the raised height", () => {
    expect(lowDetent(600, 1000, 600)).toBeLessThan(RAISED);
  });

  it("moves the sheet for no change of a few points", () => {
    expect(isWorthMoving(0.45, 0.46)).toBe(false);
    expect(isWorthMoving(0.45, 0.4)).toBe(true);
  });
});

describe("the height a place's sheet stands at", () => {
  it("is the one it opened at, raised or low", () => {
    expect(sheetDetentOf(new Map(), "a", true)).toBe(1);
    expect(sheetDetentOf(new Map(), "a", false)).toBe(0);
  });

  it("stays the one it opened at when the sheet is given another place", () => {
    const known = new Map<string, number>();
    // Pressed on the map, low; then given a place found by the search, whose address says raised.
    expect(sheetDetentOf(known, "a", false)).toBe(0);
    expect(sheetDetentOf(known, "a", true)).toBe(0);
    expect(sheetDetentOf(known, "b", true)).toBe(1);
  });

  it("is the one it was last moved to", () => {
    const known = new Map([["a", 1]]);
    expect(sheetDetentOf(known, "a", false)).toBe(1);
  });
});
