import { LOCALES } from "@repo/config/locales";
import { describe, expect, it } from "vitest";

import { baseLocale, locales } from "@/paraglide/runtime.js";

import { LANGUAGES } from "./languages";

describe("the languages", () => {
  it("are those the mails and the API know, English first", () => {
    expect(baseLocale).toBe("en");
    expect([...locales]).toEqual([...LOCALES]);
  });

  it("each have a name of their own", () => {
    expect(Object.keys(LANGUAGES)).toEqual([...locales]);
  });
});
