import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { quickActionItems } from "./quick-action-items";

const from = (path: string) => new URL(path, import.meta.url).pathname;

describe("the quick actions of the app's icon", () => {
  it("log a session, write a new alert and search, in that order", () => {
    expect(quickActionItems().map((item) => [item.title, item.params.href])).toEqual([
      ["Log a session", "/session/new"],
      ["New alert", "/alert/new"],
      ["Search", "/search"],
    ]);
  });

  it("each open a route the app has", () => {
    for (const item of quickActionItems()) {
      expect(existsSync(from(`../app${item.params.href}.tsx`))).toBe(true);
    }
  });

  it("have ids of their own, which the system keeps them by", () => {
    const ids = quickActionItems().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
