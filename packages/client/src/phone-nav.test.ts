import { describe, expect, it } from "vitest";

import { isTabPanel, tabOf, tabSearch, unreadBadge } from "./phone-nav";

describe("tabOf", () => {
  it("shows the map when the address names no panel", () => {
    expect(tabOf({})).toBe("map");
  });

  it("shows the tab whose panel the address names", () => {
    expect(tabOf({ panel: "saved" })).toBe("saved");
    expect(tabOf({ panel: "alerts" })).toBe("alerts");
    expect(tabOf({ panel: "account" })).toBe("account");
  });

  it("keeps the panel that adds a spot on the map, which takes its marker", () => {
    expect(tabOf({ panel: "add" })).toBe("map");
  });

  it("shows what is selected on the map, whatever panel is named with it", () => {
    expect(tabOf({ spot: "s1", panel: "saved" })).toBe("map");
    expect(tabOf({ station: "b1", panel: "alerts" })).toBe("map");
    expect(tabOf({ break: "k1", panel: "account" })).toBe("map");
  });

  it("takes a panel it does not know for the map", () => {
    expect(tabOf({ panel: "elsewhere" })).toBe("map");
    expect(isTabPanel("add")).toBe(false);
  });
});

describe("tabSearch", () => {
  it("opens a tab on its first screen, with nothing selected", () => {
    expect(tabSearch("alerts", { spot: "s1", panel: "saved" })).toEqual({ panel: "alerts" });
  });

  it("keeps the list the map shows alone", () => {
    expect(tabSearch("saved", { list: "l1", station: "b1" })).toEqual({
      list: "l1",
      panel: "saved",
    });
  });

  it("keeps the link a list was opened by, before any list of the account", () => {
    expect(tabSearch("account", { shared: "token", list: "l1" })).toEqual({
      shared: "token",
      panel: "account",
    });
  });

  it("gives the map back as it was left", () => {
    expect(tabSearch("map", { list: "l1", spot: "s1", panel: "saved" })).toEqual({
      list: "l1",
      spot: "s1",
      panel: undefined,
      alerts: undefined,
      settings: undefined,
    });
  });
});

describe("unreadBadge", () => {
  it("says nothing when everything was read", () => {
    expect(unreadBadge(0)).toBeUndefined();
  });

  it("counts up to nine, then says 9+", () => {
    expect(unreadBadge(3)).toBe("3");
    expect(unreadBadge(9)).toBe("9");
    expect(unreadBadge(10)).toBe("9+");
    expect(unreadBadge(57)).toBe("9+");
  });
});
