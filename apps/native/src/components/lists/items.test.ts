import type { SavedList } from "@repo/client/viewer/types";
import { afterEach, describe, expect, it } from "vitest";

import { baseLocale, setLocale } from "@/paraglide/runtime.js";

import {
  chipsOf,
  holds,
  listName,
  othersOf,
  placesCount,
  refsOf,
  retryUnlessGone,
  sizeOf,
} from "./items";

const list = (overrides: Partial<SavedList>): SavedList => ({
  id: "l",
  name: "Trips",
  isDefault: false,
  reportsOn: true,
  stationIds: [],
  breakIds: [],
  spotIds: [],
  share: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("what a list holds, as the screens read it", () => {
  const favorites = list({ id: "f", name: "favorites", isDefault: true });
  const trips = list({ stationIds: ["s1"], breakIds: ["b1", "b2"], spotIds: ["p1"] });

  it("names the favorites in the reader's language, and another list by its own name", () => {
    expect(listName(favorites)).toBe("Favorites");
    void setLocale("fr", { reload: false });
    expect(listName(favorites)).toBe("Favoris");
    expect(listName(trips)).toBe("Trips");
  });

  it("lists its spots, then its breaks, then its stations", () => {
    expect(refsOf(trips).map((ref) => `${ref.kind}:${ref.id}`)).toEqual([
      "spot:p1",
      "break:b1",
      "break:b2",
      "station:s1",
    ]);
    expect(sizeOf(trips)).toBe(4);
    expect(holds(trips, { kind: "break", id: "b2" })).toBe(true);
    expect(holds(trips, { kind: "station", id: "b2" })).toBe(false);
  });

  it("offers to move a place to every other list of the account's", () => {
    expect(othersOf([favorites, trips], "l")).toEqual([{ id: "f", name: "Favorites" }]);
  });

  it("puts the lists that were kept after the account's own, marked as shared", () => {
    const joined = [{ id: "j", name: "Theirs", isDefault: true, reportsOn: false, size: 3 }];

    expect(chipsOf([favorites], joined)).toEqual([
      { id: "f", name: "Favorites", shared: false },
      { id: "j", name: "Favorites", shared: true },
    ]);
  });

  it("counts places in words", () => {
    expect(placesCount(1)).toBe("1 place");
    expect(placesCount(4)).toBe("4 places");
  });

  it("asks again once for a list that failed, and never for one the API says is not there", () => {
    expect(retryUnlessGone(0, new Error("offline"))).toBe(true);
    expect(retryUnlessGone(1, new Error("offline"))).toBe(false);
    expect(retryUnlessGone(0, { code: "NOT_FOUND" })).toBe(false);
  });
});
