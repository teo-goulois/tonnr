import { describe, expect, it } from "vitest";

import { aloneOf, mapRouteOf, showingParams } from "./alone";

describe("the list the map shows alone", () => {
  it("is the one opened by its link first, then the account's by its id", () => {
    expect(aloneOf({ shared: "t1", list: "l1" })).toEqual({ shared: "t1" });
    expect(aloneOf({ list: "l1" })).toEqual({ list: "l1" });
    expect(aloneOf({ list: "", shared: "" })).toBeUndefined();
    expect(aloneOf(undefined)).toBeUndefined();
  });

  it("is read on the map's route, whatever tab is in view", () => {
    const state = {
      key: "tabs",
      index: 1,
      routes: [
        { key: "map", name: "index", params: { shared: "t1" } },
        { key: "saved", name: "saved", params: { list: "l2" } },
      ],
    };
    expect(aloneOf(mapRouteOf(state)?.params)).toEqual({ shared: "t1" });
    expect(mapRouteOf(undefined)).toBeUndefined();
  });

  it("takes the place of a list opened by its link once another is chosen", () => {
    const shown = { shared: "t1" };
    // Set as the navigator sets parameters, over those the route had.
    expect(aloneOf({ ...shown, ...showingParams("l1") })).toEqual({ list: "l1" });
    expect(aloneOf({ ...shown, ...showingParams(undefined) })).toBeUndefined();
  });
});
