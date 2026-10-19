import { describe, expect, it } from "vitest";

import { appOriginsOf, isCrossSiteWrite, siteOf } from "./cross-site";
import { newKey, readAuthorization } from "./keys";

describe("readAuthorization", () => {
  const key = `key_${"a".repeat(43)}`;

  it("reads no key where there is no header", () => {
    expect(readAuthorization(null)).toBeNull();
  });

  it.each([`Bearer ${key}`, `bearer ${key}`, `BEARER ${key}`])("reads the key of %s", (header) => {
    expect(readAuthorization(header)).toEqual({ via: "key", key });
  });

  it("reads the key it makes", () => {
    const made = newKey();

    expect(readAuthorization(`Bearer ${made.key}`)).toEqual({ via: "key", key: made.key });
    expect(made.key.startsWith(made.prefix)).toBe(true);
    expect(made.prefix).toHaveLength(8);
    expect(made.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(made.keyHash).not.toContain(made.key.slice(8));
  });

  it.each([
    ["", "an empty header"],
    ["Bearer", "a scheme alone"],
    ["Bearer ", "a scheme and a space"],
    [key, "a key without its scheme"],
    [`Basic ${key}`, "another scheme"],
    [`Bearer ${key} `, "a space after the key"],
    [` Bearer ${key}`, "a space before the scheme"],
    [`Bearer  ${key}`, "two spaces"],
    [`Bearer\t${key}`, "a tab in place of the space"],
    [`Bearer ${key} ${key}`, "two keys"],
    [`Bearer ${key.slice(0, -1)}`, "a key one character short"],
    [`Bearer ${key}a`, "a key one character long"],
    [`Bearer ${key.slice(0, -1)}=`, "a key with padding"],
    [`Bearer ${key.slice(0, -1)}+`, "a key in the other base64"],
    [`Bearer KEY_${"a".repeat(43)}`, "a start in upper case"],
    [`Bearer ${"a".repeat(4000)}`, "a header too long to be read"],
  ])("refuses %j: %s", (header) => {
    expect(readAuthorization(header)).toBe("refused");
  });
});

describe("isCrossSiteWrite", () => {
  const trusted = ["https://app.example.org", "https://api.example.org"];
  const write = {
    method: "POST",
    origin: "https://elsewhere.example",
    referer: null,
    hasCookie: true,
  };

  it("refuses a write that another site's page sends with the visitor's cookie", () => {
    expect(isCrossSiteWrite(write, trusted)).toBe(true);
    for (const method of ["PUT", "PATCH", "DELETE", "post"]) {
      expect(isCrossSiteWrite({ ...write, method }, trusted)).toBe(true);
    }
  });

  it("refuses the origin a browser gives a page it will not name", () => {
    expect(isCrossSiteWrite({ ...write, origin: "null" }, trusted)).toBe(true);
  });

  it("takes an origin for another when only its start is the same", () => {
    const origin = "https://app.example.org.elsewhere.example";

    expect(isCrossSiteWrite({ ...write, origin }, trusted)).toBe(true);
  });

  it.each(trusted)("lets a page of %s write", (origin) => {
    expect(isCrossSiteWrite({ ...write, origin }, trusted)).toBe(false);
  });

  it("reads the site from the page's address when the browser names no origin", () => {
    const from = (referer: string) => ({ ...write, origin: null, referer });

    expect(isCrossSiteWrite(from("https://elsewhere.example/form"), trusted)).toBe(true);
    expect(isCrossSiteWrite(from("https://app.example.org/app?x=1"), trusted)).toBe(false);
    expect(isCrossSiteWrite(from("https://app.example.org.elsewhere.example/"), trusted)).toBe(
      true,
    );
    expect(isCrossSiteWrite(from("not an address"), trusted)).toBe(true);
  });

  it("believes the origin over the page's address when both are given", () => {
    const both = { ...write, referer: "https://app.example.org/app" };

    expect(isCrossSiteWrite(both, trusted)).toBe(true);
    expect(
      isCrossSiteWrite(
        { ...write, origin: "https://app.example.org", referer: "https://elsewhere.example/" },
        trusted,
      ),
    ).toBe(false);
  });

  it("refuses a write with a cookie that names no site at all", () => {
    expect(isCrossSiteWrite({ ...write, origin: null }, trusted)).toBe(true);
  });

  it.each(["GET", "HEAD", "OPTIONS", "get"])(
    "lets a %s through, which writes nothing",
    (method) => {
      expect(isCrossSiteWrite({ ...write, method }, trusted)).toBe(false);
      expect(isCrossSiteWrite({ ...write, method, origin: null }, trusted)).toBe(false);
    },
  );

  it("lets a request without a cookie through, which has no session to borrow", () => {
    expect(isCrossSiteWrite({ ...write, hasCookie: false }, trusted)).toBe(false);
    expect(isCrossSiteWrite({ ...write, hasCookie: false, origin: null }, trusted)).toBe(false);
  });
});

describe("an app for phones", () => {
  const trusted = ["https://app.example.org", "app.example://"];
  const write = { method: "POST", origin: null, referer: null, hasCookie: true };

  it("is known by the origin it names in expo-origin, which a browser cannot send bare", () => {
    expect(siteOf({ ...write, appOrigin: "app.example://" })).toBe("app.example://");
    expect(isCrossSiteWrite({ ...write, appOrigin: "app.example://" }, trusted)).toBe(false);
    expect(isCrossSiteWrite({ ...write, appOrigin: "other.example://" }, trusted)).toBe(true);
  });

  it("is believed less than Origin, which a browser always writes", () => {
    const fromPage = { ...write, origin: "https://elsewhere.example", appOrigin: "app.example://" };

    expect(siteOf(fromPage)).toBe("https://elsewhere.example");
    expect(isCrossSiteWrite(fromPage, trusted)).toBe(true);
  });

  it("names no site when it gives a web address, which is a site's and no app's", () => {
    expect(siteOf({ ...write, appOrigin: "https://app.example.org" })).toBeNull();
    expect(siteOf({ ...write, appOrigin: "null" })).toBeNull();
  });

  it("is read before the page's address", () => {
    const both = { ...write, appOrigin: "app.example://", referer: "https://elsewhere.example/" };

    expect(siteOf(both)).toBe("app.example://");
  });

  it("names itself as the instance lists it, or as the apps of this repository do", () => {
    expect(appOriginsOf(undefined, "app.tonnr")).toEqual(["app.tonnr://"]);
    expect(appOriginsOf(" app.one:// , app.two://,app.one://", "app.tonnr")).toEqual([
      "app.one://",
      "app.two://",
    ]);
    expect(appOriginsOf("", "app.tonnr")).toEqual([]);
  });

  it.each([
    "null",
    "null://",
    "https://app.example.org",
    "http://",
    "https://",
    "app.example",
    "app.example://path",
    "App.Example://",
    "javascript://",
    "file://",
  ])("refuses %j as an app's origin, so that no page is trusted for one", (origin) => {
    expect(() => appOriginsOf(origin, "app.tonnr")).toThrow();
  });
});
