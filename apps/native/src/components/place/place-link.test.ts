import { describe, expect, it } from "vitest";

import { placeLink, shareContent, siteLink } from "./place-link";

const SITE = "https://tonnr.app";

describe("the short address a place is sent by", () => {
  it("is /b/ for a break and /s/ for a station, under the language's prefix", () => {
    const languages = { site: SITE, baseLocale: "en" };
    expect(placeLink({ breakId: "abc" }, { ...languages, locale: "en" })).toBe(
      "https://tonnr.app/b/abc",
    );
    expect(placeLink({ stationId: "62001" }, { ...languages, locale: "fr" })).toBe(
      "https://tonnr.app/fr/s/62001",
    );
  });

  it("gives iOS the address apart and Android one text that ends with it", () => {
    const shared = { title: "La Torche", text: "La Torche on Tonnr", url: `${SITE}/b/abc` };
    expect(shareContent(shared, "ios")).toEqual({
      title: "La Torche",
      message: "La Torche on Tonnr",
      url: `${SITE}/b/abc`,
    });
    expect(shareContent(shared, "android").message).toBe(`La Torche on Tonnr ${SITE}/b/abc`);
  });
});

describe("a page of the site", () => {
  it("is under the reader's language's prefix, none for the base language's", () => {
    const site = { site: SITE, baseLocale: "en" };
    expect(siteLink("/terms", { ...site, locale: "en" })).toBe("https://tonnr.app/terms");
    expect(siteLink("/terms", { ...site, locale: "pt" })).toBe("https://tonnr.app/pt/terms");
  });
});
