import { describe, expect, it } from "vitest";

import { leavesOf, menuActions } from "./menu-actions";

const one = (id: string) => ({ id, title: id });

describe("the groups of a place's menu", () => {
  it("parts the groups of a spot of one's own as the web's separators do", () => {
    const actions = menuActions([
      { actions: [one("alert")] },
      { title: "Get there with", actions: [one("apple"), one("waze")] },
      { actions: [one("edit"), one("publish")] },
      { actions: [{ ...one("delete"), attributes: { destructive: true } }] },
    ]);
    expect(actions.map((action) => action.id)).toEqual([
      "alert",
      "group-1",
      "edit",
      "publish",
      "group-3",
    ]);
    expect(actions[1]).toMatchObject({ title: "Get there with", displayInline: true });
    expect(actions[4]).toMatchObject({ title: "", displayInline: true });
  });

  it("gives a group with a title its own section, wherever it stands", () => {
    const actions = menuActions([
      { actions: [] },
      { title: "Get there with", actions: [one("apple")] },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ title: "Get there with", displayInline: true });
  });

  it("offers a screen reader every action that can be done, its groups opened", () => {
    const actions = menuActions([
      { actions: [one("alert"), { ...one("unpublish"), attributes: { disabled: true } }] },
      { title: "Get there with", actions: [one("apple"), one("waze")] },
    ]);
    expect(leavesOf(actions).map((action) => action.id)).toEqual(["alert", "apple", "waze"]);
  });
});
