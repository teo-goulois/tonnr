import { describe, expect, it } from "vitest";

import { destinationOfAddress } from "./links";

const SITE = "https://tonnr.example";
const to = (address: string) => destinationOfAddress(address, SITE);

describe("where a link takes the app", () => {
  it("opens a break, a station and a list by their short addresses, in any language", () => {
    expect(to(`${SITE}/b/abc`)).toEqual({ route: "/place/break/abc" });
    expect(to(`${SITE}/fr/s/41012`)).toEqual({ route: "/place/station/41012" });
    expect(to(`${SITE}/l/tok`)).toEqual({ route: "/saved/shared/tok" });
    expect(to(`${SITE}/i/inv`)).toEqual({ route: "/?invite=inv" });
  });

  it("reads the app's scheme as a path of the site", () => {
    expect(to("app.tonnr://b/abc")).toEqual({ route: "/place/break/abc" });
    expect(to("app.tonnr://")).toEqual({ route: "/" });
  });

  it("opens what a push or a mail names with the map's parameters", () => {
    expect(to(`${SITE}/app?break=abc&tab=reports&notice=n1`)).toEqual({
      route: "/place/break/abc?tab=reports&notice=n1",
    });
    expect(to(`${SITE}/fr/app?spot=s1`)).toEqual({ route: "/place/spot/s1" });
    expect(to(`${SITE}/app?panel=alerts`)).toEqual({ route: "/alerts" });
    expect(to(`${SITE}/app?panel=account&settings=alerts`)).toEqual({ route: "/account/alerts" });
    expect(to(`${SITE}/app?break=abc&create=alert`)).toEqual({
      route: "/alert/new?place=break%3Aabc",
    });
  });

  it("opens the screens the web's phone shows for the alerts and the lists", () => {
    // Every alert's mail links to how to be told by its old address.
    expect(to(`${SITE}/app?panel=alerts&alerts=settings`)).toEqual({ route: "/account/alerts" });
    expect(to(`${SITE}/app?panel=alerts&alerts=mine`)).toEqual({ route: "/alerts?view=mine" });
    // A list alone on the map, or in the saved tab as well when the address names it.
    expect(to(`${SITE}/app?list=l1`)).toEqual({ route: "/?list=l1" });
    expect(to(`${SITE}/app?list=l1&panel=saved`)).toEqual({ route: "/saved?list=l1" });
    // A list opened by its link, in the saved tab where its short address leads, or alone on
    // the map.
    expect(to(`${SITE}/app?shared=tok&panel=saved`)).toEqual({ route: "/saved/shared/tok" });
    expect(to(`${SITE}/app?shared=tok`)).toEqual({ route: "/?shared=tok" });
    // What is selected comes first, as on the web's phone.
    expect(to(`${SITE}/app?station=41012&list=l1&panel=saved`)).toEqual({
      route: "/place/station/41012",
    });
  });

  it("asks the API for a break named by the address of its page", () => {
    expect(to(`${SITE}/spots/fr/pays-basque/parlementia`)).toEqual({
      breakPage: { country: "fr", region: "pays-basque", slug: "parlementia" },
    });
  });

  it("takes the token of a new password to its screen", () => {
    expect(to(`${SITE}/es/reset-password?token=t1`)).toEqual({ route: "/reset-password?token=t1" });
  });

  it("leaves another site and an address it does not take to the browser", () => {
    expect(to("https://elsewhere.example/b/abc")).toEqual({
      browser: "https://elsewhere.example/b/abc",
    });
    expect(to(`${SITE}/connect`)).toEqual({ browser: `${SITE}/connect` });
    // What follows the scheme is a path of the site, never another host.
    expect(to("app.tonnr:/\\elsewhere.example/b/x")).toEqual({
      browser: `${SITE}/elsewhere.example/b/x`,
    });
  });
});
