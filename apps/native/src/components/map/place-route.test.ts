import { describe, expect, it } from "vitest";

import {
  givesToSheet,
  newSpotHref,
  opensAgain,
  opensRaised,
  overHref,
  placeHref,
  placeOf,
  pressedHref,
  selectsOnMap,
  TAB_ROUTES,
  tabUnder,
} from "./place-route";

describe("the address of a place's sheet", () => {
  it("names the place it opens, and reads it back", () => {
    expect(placeHref("station", "ndbc/41001")).toBe("/place/station/ndbc%2F41001");
    expect(placeOf(placeHref("station", "ndbc/41001"))).toEqual({
      kind: "station",
      id: "ndbc/41001",
    });
    expect(placeOf("/place/break/b1")).toEqual({ kind: "break", id: "b1" });
  });

  it("is none for any other screen", () => {
    expect(placeOf("/")).toBeUndefined();
    expect(placeOf("/search")).toBeUndefined();
    expect(placeOf("/place/planet/1")).toBeUndefined();
    expect(placeOf("/place/spot")).toBeUndefined();
    expect(placeOf("/place/spot/1/more")).toBeUndefined();
  });
});

describe("the tab under a screen", () => {
  it("is the map under a place's sheet, as the web reads what is selected on the map", () => {
    expect(tabUnder("/place/break/b1")).toBe("map");
    expect(TAB_ROUTES[tabUnder("/place/station/s1")!]).toBe("index");
  });

  it("is the one in view under any other screen", () => {
    expect(tabUnder("/saved")).toBeUndefined();
    expect(tabUnder("/sign-in")).toBeUndefined();
    expect(tabUnder("/place/save")).toBeUndefined();
  });
});

describe("how a place's sheet opens", () => {
  it("opens low for a press on the map, which reads it as the same place", () => {
    expect(pressedHref("break", "b1")).toBe("/place/break/b1?from=map");
    expect(opensRaised({ kind: "break", id: "b1", from: "map" })).toBe(false);
  });

  it("opens raised for what was chosen anywhere else", () => {
    expect(opensRaised({ kind: "break", id: "b1" })).toBe(true);
    expect(opensRaised({ kind: "break", id: "b1", tab: "reports" })).toBe(true);
    expect(opensRaised(undefined)).toBe(true);
  });
});

describe("a station opened from a place's sheet", () => {
  it("opens raised over the place's sheet, and leaves the place selected on the map", () => {
    expect(overHref("station", "ndbc/1")).toBe("/place/station/ndbc%2F1?from=place");
    const params = { kind: "station", id: "ndbc/1", from: "place" };
    expect(opensRaised(params)).toBe(true);
    expect(selectsOnMap(params)).toBeUndefined();
  });

  it("is none of the places a sheet selects otherwise", () => {
    expect(selectsOnMap({ kind: "break", id: "b1" })).toEqual({ kind: "break", id: "b1" });
    expect(selectsOnMap({ kind: "break", id: "b1", from: "map" })).toEqual({
      kind: "break",
      id: "b1",
    });
    expect(selectsOnMap({ kind: "planet", id: "b1" })).toBeUndefined();
    expect(selectsOnMap({ kind: "break" })).toBeUndefined();
    expect(selectsOnMap(undefined)).toBeUndefined();
  });
});

describe("the sheet of a spot just added", () => {
  it("says so to the sheet, which opens raised on its offers", () => {
    expect(newSpotHref("s/1")).toBe("/place/spot/s%2F1?new=1");
    expect(placeOf(newSpotHref("s1").split("?")[0]!)).toEqual({ kind: "spot", id: "s1" });
    expect(opensRaised({ kind: "spot", id: "s1", new: "1" })).toBe(true);
  });
});

describe("one sheet of a place", () => {
  it("gives the address of a place to the sheet that is open", () => {
    expect(givesToSheet(placeHref("break", "b1"), true)).toBe(true);
    expect(givesToSheet(`${placeHref("break", "b1")}?tab=reports`, true)).toBe(true);
    expect(givesToSheet(newSpotHref("s1"), true)).toBe(true);
  });

  it("opens a sheet when none is open, and any other address as it would", () => {
    expect(givesToSheet(placeHref("break", "b1"), false)).toBe(false);
    expect(givesToSheet("/place/save?kind=break&id=b1", true)).toBe(false);
    expect(givesToSheet("/saved/shared/t1", true)).toBe(false);
    expect(givesToSheet("/", true)).toBe(false);
  });
});

describe("a place asked for twice", () => {
  const last = { key: "station:buoy-1", at: 1_000 };

  it("is the same press when it comes again before its sheet is in front", () => {
    expect(opensAgain(last, "station:buoy-1", 1_400)).toBe(true);
  });

  it("is a new press for another place, or once the moment has passed", () => {
    expect(opensAgain(last, "break:b-1", 1_400)).toBe(false);
    expect(opensAgain(last, "station:buoy-1", 2_600)).toBe(false);
    expect(opensAgain(null, "station:buoy-1", 1_400)).toBe(false);
  });
});
