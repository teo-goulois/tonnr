import { LOCALES } from "@repo/config/locales";
import { describe, expect, it } from "vitest";

import { baseLocale, locales } from "@/paraglide/runtime.js";

describe("the app's languages", () => {
  it("are the web app's, which the mails and the API know, English first", () => {
    expect(baseLocale).toBe("en");
    expect([...locales]).toEqual([...LOCALES]);
  });
});
