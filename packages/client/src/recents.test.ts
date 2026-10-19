import { describe, expect, it } from "vitest";

import { type Recent, RECENTS_MOST, readRecents, withViewed } from "./recents";

const at = (id: string, kind: Recent["kind"] = "break"): Recent => ({
  kind,
  id,
  name: `Name of ${id}`,
  latitude: 47,
  longitude: -4,
});

describe("what was looked at last", () => {
  it("puts what is opened first", () => {
    expect(withViewed([at("one")], at("two")).map((recent) => recent.id)).toEqual(["two", "one"]);
  });

  it("holds what is opened again once, first, as it is named now", () => {
    const renamed = { ...at("one"), name: "Another name" };
    expect(withViewed([at("two"), at("one")], renamed)).toEqual([renamed, at("two")]);
  });

  it("tells a station from a break of the same id", () => {
    expect(withViewed([at("one", "station")], at("one"))).toHaveLength(2);
  });

  it("lets the oldest go", () => {
    const full = ["one", "two", "three", "four", "five"].map((id) => at(id));
    const list = withViewed(full, at("six"));
    expect(list).toHaveLength(RECENTS_MOST);
    expect(list.map((recent) => recent.id)).toEqual(["six", "one", "two", "three", "four"]);
  });
});

describe("what a browser kept", () => {
  it("is read as it was written", () => {
    expect(readRecents([at("one"), at("two", "spot")])).toEqual([at("one"), at("two", "spot")]);
  });

  it("is nothing when it is no list", () => {
    expect(readRecents(null)).toEqual([]);
    expect(readRecents({ kind: "break" })).toEqual([]);
  });

  it("leaves out what this app did not write, and what is there twice", () => {
    expect(
      readRecents([
        at("one"),
        { ...at("two"), kind: "town" },
        { ...at("three"), latitude: "47" },
        "four",
        at("one"),
      ]),
    ).toEqual([at("one")]);
  });

  it("keeps no more than a list holds, and nothing but what a list says", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ ...at(id), viewedAt: "now" }));
    expect(readRecents(many)).toEqual(["a", "b", "c", "d", "e"].map((id) => at(id)));
  });
});
