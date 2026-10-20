import { describe, expect, it } from "vitest";

import { actionsOf } from "./actions";

const favorites = { id: "f", name: "Favorites" };
const trips = { id: "t", name: "Trips" };

describe("what a place's row offers", () => {
  it("offers a break in a list of the account's everything, moving to another list too", () => {
    expect(actionsOf({ kind: "break", id: "b" }, { list: favorites, others: [trips] })).toEqual([
      "open",
      "move",
      "alert",
      "share",
      "remove",
    ]);
  });

  it("moves nothing when the account has no other list", () => {
    expect(actionsOf({ kind: "break", id: "b" }, { list: favorites, others: [] })).not.toContain(
      "move",
    );
  });

  it("sets an alert at a spot of the account's own, and sends no spot by an address", () => {
    expect(actionsOf({ kind: "spot", id: "s" }, { list: favorites, ownSpot: true })).toEqual([
      "open",
      "alert",
      "remove",
    ]);
    // A spot of a list someone shared is its owner's.
    expect(actionsOf({ kind: "spot", id: "s" }, {})).toEqual(["open"]);
  });

  it("sets no alert at a station, and takes out nothing a row does not stand in a list for", () => {
    expect(actionsOf({ kind: "station", id: "s" }, {})).toEqual(["open", "share"]);
  });
});
