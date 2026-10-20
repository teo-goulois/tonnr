import type { SavedList } from "@repo/client/viewer/types";
import { describe, expect, it } from "vitest";

import { FAVORITES, choicesOf, holds, withAnswered, withSaved } from "./lists";

function list(id: string, values: Partial<SavedList> = {}): SavedList {
  return {
    id,
    name: id,
    isDefault: false,
    reportsOn: true,
    stationIds: [],
    breakIds: [],
    spotIds: [],
    share: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...values,
  } as SavedList;
}

describe("the lists a bookmark offers", () => {
  const item = { breakId: "b1" };

  it("offers the favorites first, even before they exist", () => {
    const choices = choicesOf([list("weekend")], item, "Favorites");
    expect(choices.map((choice) => choice.id)).toEqual([FAVORITES, "weekend"]);
    expect(choices[0]!.name).toBe("Favorites");
  });

  it("names the default list in the reader's language and checks what holds the place", () => {
    const lists = [list("weekend"), list("default", { isDefault: true, breakIds: ["b1"] })];
    const choices = choicesOf(lists, item, "Favoris");
    expect(choices.map((choice) => [choice.id, choice.name, choice.checked])).toEqual([
      ["default", "Favoris", true],
      ["weekend", "weekend", false],
    ]);
    expect(holds(lists[1]!, { stationId: "b1" })).toBe(false);
  });

  it("adds and takes out at once, making the favorites with their first place", () => {
    const made = withSaved([list("weekend")], FAVORITES, item, true);
    expect(made[0]!.isDefault).toBe(true);
    expect(made[0]!.breakIds).toEqual(["b1"]);

    const added = withSaved([list("weekend")], "weekend", { spotId: "s1" }, true);
    expect(added[0]!.spotIds).toEqual(["s1"]);
    const again = withSaved(added, "weekend", { spotId: "s1" }, true);
    expect(again[0]!.spotIds).toEqual(["s1"]);
    expect(withSaved(added, "weekend", { spotId: "s1" }, false)[0]!.spotIds).toEqual([]);
  });

  it("puts the API's answer in place of the favorites it drew before", () => {
    const drawn = withSaved([list("weekend")], FAVORITES, item, true);
    const answered = list("default-id", { isDefault: true, breakIds: ["b1"] });
    const lists = withAnswered(drawn, answered);
    expect(lists.map((one) => one.id)).toEqual(["default-id", "weekend"]);
    expect(withAnswered(lists, { ...lists[1]!, name: "renamed" })[1]!.name).toBe("renamed");
  });
});
