import { describe, expect, it } from "vitest";

import { placeHref, placeOf } from "./place-route";

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
