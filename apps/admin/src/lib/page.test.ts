import { describe, expect, it } from "vitest";

import { pageOf } from "./page";

describe("the page a sign-in leads back to", () => {
  it("is a page of this app, with what it searched for", () => {
    expect(pageOf("/instance")).toBe("/instance");
    expect(pageOf("/accounts?q=ana%40example.org")).toBe("/accounts?q=ana%40example.org");
    expect(pageOf("/developers/3f0c?range=week#keys")).toBe("/developers/3f0c?range=week#keys");
  });

  it("is the first page for anything else, another site among them", () => {
    for (const asked of [
      "https://elsewhere.example/",
      "//elsewhere.example/",
      "/\\elsewhere.example/",
      "javascript:alert(1)",
      "instance",
      "",
      "/login",
      "/login?to=/login",
      "/inst\nance",
      "/" + "a".repeat(2001),
      42,
      null,
      undefined,
      ["/instance"],
    ]) {
      expect(pageOf(asked), JSON.stringify(asked)).toBe("/");
    }
  });
});
