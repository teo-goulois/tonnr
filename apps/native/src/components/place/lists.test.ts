import type { SavedList } from "@repo/client/viewer/types";
import { describe, expect, it } from "vitest";

import { FAVORITES, choicesOf, withAnswered, withSaved } from "./lists";

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
  const place = { kind: "break", id: "b1" } as const;

  it("offers the favorites first, even before they exist", () => {
    const choices = choicesOf([list("weekend")], place);
    expect(choices.map((choice) => choice.id)).toEqual([FAVORITES, "weekend"]);
    expect(choices[0]!.name).toBe("Favorites");
  });

  it("names the default list in the reader's language and checks what holds the place", () => {
    const lists = [list("weekend"), list("default", { isDefault: true, breakIds: ["b1"] })];
    expect(choicesOf(lists, place).map((one) => [one.id, one.name, one.checked])).toEqual([
      ["default", "Favorites", true],
      ["weekend", "weekend", false],
    ]);
    // A station of the same id is another place.
    expect(choicesOf(lists, { kind: "station", id: "b1" })[0]!.checked).toBe(false);
  });

  it("adds and takes out at once, making the favorites with their first place", () => {
    const made = withSaved([list("weekend")], FAVORITES, place, true);
    expect(made[0]!.isDefault).toBe(true);
    expect(made[0]!.breakIds).toEqual(["b1"]);

    const spot = { kind: "spot", id: "s1" } as const;
    const added = withSaved([list("weekend")], "weekend", spot, true);
    expect(added[0]!.spotIds).toEqual(["s1"]);
    expect(withSaved(added, "weekend", spot, true)[0]!.spotIds).toEqual(["s1"]);
    expect(withSaved(added, "weekend", spot, false)[0]!.spotIds).toEqual([]);
  });

  it("puts the API's answer in place of the favorites it drew before", () => {
    const drawn = withSaved([list("weekend")], FAVORITES, place, true);
    const answered = list("default-id", { isDefault: true, breakIds: ["b1"] });
    const lists = withAnswered(drawn, answered);
    expect(lists.map((one) => one.id)).toEqual(["default-id", "weekend"]);
    expect(withAnswered(lists, { ...lists[1]!, name: "renamed" })[1]!.name).toBe("renamed");
    // The lists' own answer may have put the favorites last: they come first again.
    expect(withAnswered([...drawn, answered], answered).map((one) => one.id)).toEqual([
      "default-id",
      "weekend",
    ]);
  });
});
