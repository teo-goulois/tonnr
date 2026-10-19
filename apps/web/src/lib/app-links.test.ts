import {
  APP_LINK_PATHS,
  MAP_PARAMETERS,
  claimedPaths,
  isClaimedPath,
  readAppLink,
} from "@repo/config/links";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { locales, localizeHref } from "@/paraglide/runtime.js";
import { Route as BreakLink } from "@/routes/b.$id";
import { Route as InviteLink } from "@/routes/i.$token";
import { Route as ListLink } from "@/routes/l.$token";
import { Route as StationLink } from "@/routes/s.$id";

import { mapSearch } from "./map-search";

// The links that open the apps for phones, and how an app reads one: decision 073. The list and
// the reader live in `packages/config`, which the app imports. They are read here, beside the
// web's routes they follow.

const site = "https://site.example";

// What each address of the list is read with, written in one language as the web writes it.
const SAMPLES: Record<(typeof APP_LINK_PATHS)[number], string> = {
  "/app": "/app?break=b-1",
  "/b/:id": "/b/b-1",
  "/s/:id": "/s/62001",
  "/l/:token": "/l/the-token",
  "/i/:token": "/i/the-token",
  "/spots/:country/:region/:slug": "/spots/france/brittany/la-torche",
  "/reset-password": "/reset-password?token=abc",
};

// What stays in the browser: decision 073, "Which addresses open the app".
const LEFT_OUT = [
  "/",
  "/connect",
  "/login",
  "/forgot-password",
  "/verified",
  "/mail-off",
  "/og/place",
  "/ingest/e",
  "/learn",
  "/learn/beginner",
  "/sources",
  "/agents",
  "/contact",
  "/llms.txt",
  "/terms",
  "/privacy",
  "/legal",
  "/spots",
  "/spots/france",
  "/spots/france/brittany",
  // What a short address or a page of a break would be with a segment missing or one too many.
  "/b",
  "/b/",
  "/b/b-1/more",
  "/spots/france/brittany/la-torche/more",
  "/app/",
  "/app/more",
];

describe("the addresses the apps take", () => {
  it("are each one in every language, as the web writes it", () => {
    const claimed = claimedPaths();
    expect(claimed).toHaveLength(APP_LINK_PATHS.length * locales.length);
    for (const locale of locales) {
      expect(claimed).toContain(localizeHref("/app", { locale }));
      expect(claimed).toContain(`${localizeHref("/b", { locale })}/:id`);
    }
  });

  it("are claimed, and each opens a screen of the app, in every language", () => {
    for (const locale of locales) {
      for (const sample of Object.values(SAMPLES)) {
        const address = new URL(localizeHref(sample, { locale }), site);
        expect(isClaimedPath(address.pathname), address.pathname).toBe(true);
        expect(readAppLink(address.href, site).screen, address.href).not.toBe("browser");
      }
    }
  });

  it("leave the rest to the browser, in every language", () => {
    for (const locale of locales) {
      for (const path of LEFT_OUT) {
        const address = new URL(localizeHref(path, { locale }), site);
        expect(isClaimedPath(address.pathname), address.pathname).toBe(false);
        expect(readAppLink(address.href, site), address.href).toEqual({
          screen: "browser",
          url: address.href,
        });
      }
    }
  });
});

describe("readAppLink", () => {
  it("reads the parameters of the map, and leaves out what the map does not read", () => {
    expect(
      readAppLink(`${site}/fr/app?break=b-1&tab=reports&notice=n-1&utm_source=mail`, site),
    ).toEqual({ screen: "map", search: { break: "b-1", tab: "reports", notice: "n-1" } });
    expect(readAppLink(`${site}/app?panel=alerts&alerts=settings`, site)).toEqual({
      screen: "map",
      search: { panel: "alerts", alerts: "settings" },
    });
    expect(readAppLink(`${site}/app`, site)).toEqual({ screen: "map", search: {} });
  });

  it("leads a short address where the web leads it", () => {
    expect(readAppLink(`${site}/b/b%201`, site)).toEqual({
      screen: "map",
      search: { break: "b 1" },
    });
    expect(readAppLink(`${site}/es/s/62001`, site)).toEqual({
      screen: "map",
      search: { station: "62001" },
    });
    expect(readAppLink(`${site}/pt/l/the-token`, site)).toEqual({
      screen: "map",
      search: { shared: "the-token", panel: "saved" },
    });
    expect(readAppLink(`${site}/i/the-token`, site)).toEqual({
      screen: "map",
      search: { invite: "the-token" },
    });
  });

  it("reads the page of a surf break, and the reset of a password with its token or none", () => {
    expect(readAppLink(`${site}/fr/spots/france/brittany/la-torche`, site)).toEqual({
      screen: "break",
      country: "france",
      region: "brittany",
      slug: "la-torche",
    });
    expect(readAppLink(`${site}/es/reset-password?token=abc`, site)).toEqual({
      screen: "reset-password",
      token: "abc",
    });
    expect(readAppLink(`${site}/reset-password`, site)).toEqual({
      screen: "reset-password",
      token: null,
    });
  });

  it("reads a link of the app's own scheme as the same path on the site", () => {
    expect(readAppLink("app.tonnr://b/b-1", site)).toEqual({
      screen: "map",
      search: { break: "b-1" },
    });
    expect(readAppLink("app.tonnr:///fr/app?spot=s-1", site)).toEqual({
      screen: "map",
      search: { spot: "s-1" },
    });
    // The scheme alone opens the app on its map, and not the landing in a browser.
    expect(readAppLink("app.tonnr://", site)).toEqual({ screen: "map", search: {} });
    expect(readAppLink("app.tonnr://connect", site)).toEqual({
      screen: "browser",
      url: `${site}/connect`,
    });
  });

  it("never reads what follows the app's scheme as another site", () => {
    for (const address of [
      "app.tonnr:////other.example/b/b-1",
      "app.tonnr:/\\other.example/b/b-1",
      "app.tonnr://\\\\other.example/b/b-1",
      "app.tonnr:/\t/other.example/b/b-1",
      "app.tonnr:// //other.example/b/b-1",
    ]) {
      expect(readAppLink(address, site), address).toEqual({
        screen: "browser",
        url: `${site}/other.example/b/b-1`,
      });
    }
  });

  it("reads a path alone against the site, as a push may carry it", () => {
    expect(readAppLink("/app?station=62001", site)).toEqual({
      screen: "map",
      search: { station: "62001" },
    });
  });

  it("opens an address of another site, or another scheme, in the browser as it came", () => {
    for (const address of [
      "https://other.example/app?break=b-1",
      "http://site.example/b/b-1",
      "https://www.site.example/b/b-1",
      "https://api.site.example/api/auth/callback/google",
    ]) {
      expect(readAppLink(address, site)).toEqual({ screen: "browser", url: address });
    }
    expect(readAppLink(`${site}/b/%E0%A4%A`, site)).toEqual({
      screen: "browser",
      url: `${site}/b/%E0%A4%A`,
    });
  });
});

describe("the map's parameters", () => {
  it("are the ones the web's route reads, no more and no fewer", () => {
    expect(Object.keys(mapSearch.shape).sort()).toEqual([...MAP_PARAMETERS].sort());
  });
});

describe("the web's short addresses", () => {
  // Where a short route sends a browser, as the route itself says it.
  function ledTo(route: { options: { beforeLoad?: unknown } }, params: Record<string, string>) {
    try {
      (route.options.beforeLoad as (context: { params: Record<string, string> }) => void)({
        params,
      });
    } catch (thrown) {
      if (isRedirect(thrown)) return thrown.options;
      throw thrown;
    }
    throw new Error("The route sent the browser nowhere.");
  }

  it("lead where the app reads them", () => {
    const routes: {
      route: { options: { beforeLoad?: unknown } };
      path: string;
      params: Record<string, string>;
    }[] = [
      { route: BreakLink, path: "/b/b-1", params: { id: "b-1" } },
      { route: StationLink, path: "/s/62001", params: { id: "62001" } },
      { route: ListLink, path: "/l/the-token", params: { token: "the-token" } },
      { route: InviteLink, path: "/i/the-token", params: { token: "the-token" } },
    ];
    for (const { route, path, params } of routes) {
      const led = ledTo(route, params);
      expect(led.to).toBe("/app");
      expect(readAppLink(`${site}${path}`, site)).toEqual({ screen: "map", search: led.search });
    }
  });
});
