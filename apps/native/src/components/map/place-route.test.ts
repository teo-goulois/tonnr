import { describe, expect, it } from "vitest";

import { placeHref, placeOf, TAB_ROUTES, tabUnder } from "./place-route";

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
