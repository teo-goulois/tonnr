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
  floatsSheets,
  sheetShift,
  standingHeight,
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

describe("how far the low sheet stands over its share", () => {
  it("is what was measured over what the share gives, to the point", () => {
    // iOS 26 floats the sheet over the bottom of the screen.
    expect(sheetShift(380.4, 372)).toBe(8);
    expect(sheetShift(372, 372)).toBe(0);
    expect(sheetShift(368, 372)).toBe(-4);
  });

  it("is none for a measure taken as the sheet moved", () => {
    expect(sheetShift(700, 372)).toBeUndefined();
    expect(sheetShift(Number.NaN, 372)).toBeUndefined();
  });
});

describe("how tall a low sheet stands on the screen", () => {
  it("is drawn smaller and floated by iOS 26, as measured on an iPhone of 402 points", () => {
    // Laid out 353 and 290.67 points tall, its top stood 527 and 587 points under the top of a
    // screen of 874.
    expect(874 - standingHeight(353, 402, true)).toBeCloseTo(527, 0);
    expect(874 - standingHeight(290.67, 402, true)).toBeCloseTo(587, 0);
  });

  it("is as laid out where the platform does not float it", () => {
    expect(standingHeight(353, 402, false)).toBe(353);
  });

  it("is floated from iOS 26 alone", () => {
    expect(floatsSheets("ios", "26.0")).toBe(true);
    expect(floatsSheets("ios", "27.1")).toBe(true);
    expect(floatsSheets("ios", "18.6")).toBe(false);
    expect(floatsSheets("android", 36)).toBe(false);
  });
});
