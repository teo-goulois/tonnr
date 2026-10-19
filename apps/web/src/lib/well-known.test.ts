import { APP_SCHEME } from "@repo/config/app";
import { claimedPaths, isClaimedPath } from "@repo/config/links";
import { describe, expect, it } from "vitest";

import { locales, localizeHref } from "@/paraglide/runtime.js";

import worker from "../server";
import {
  ANDROID_FILE,
  APPLE_FILE,
  appleAppSiteAssociation,
  appleComponents,
  assetLinks,
  fingerprintsOf,
  wellKnownFile,
} from "./well-known";

// The two files that let a phone open the app: decision 073.

const site = "https://site.example";
const TEAM = "A1B2C3D4E5";
const SIGNING =
  "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const UPLOAD =
  "fa:c6:17:45:dc:09:03:78:6f:b9:ed:e6:2a:96:2b:39:9f:73:48:f0:bb:6f:89:9b:83:32:66:75:91:03:3b:9c";
const stage = { APPLE_TEAM_ID: TEAM, ANDROID_CERT_SHA256: `${SIGNING}, ${UPLOAD}` };

/**
 * Whether Apple's file opens the app at a path, read as Apple reads its components: the first
 * that matches decides, `?` is one character and `*` any number, across a slash or not, as Apple
 * does not say.
 */
function appleTakes(path: string, star: "crosses" | "stops") {
  const any = star === "crosses" ? ".*" : "[^/]*";
  const one = star === "crosses" ? "." : "[^/]";
  for (const component of appleComponents()) {
    const pattern = component["/"]
      .replaceAll(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("?", one)
      .replaceAll("*", any);
    if (new RegExp(`^${pattern}$`).test(path)) return !("exclude" in component);
  }
  return false;
}

// Paths around the ones the app takes, in every language: each of them, what the web would read
// with a segment more or one less, and the pages decision 073 leaves to the browser.
const PATHS = locales.flatMap((locale) => {
  const taken = claimedPaths().map((path) => path.replaceAll(/:\w+/g, "x-1"));
  const left = [
    "/",
    "/connect",
    "/login",
    "/forgot-password",
    "/verified",
    "/mail-off",
    "/og/place",
    "/ingest/e",
    "/learn",
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
    "/b",
    "/b/",
    "/app/",
  ].map((path) => localizeHref(path, { locale }));
  return [...taken, ...taken.map((path) => `${path}/more`), ...left];
});

describe("Apple's file", () => {
  it("names the app by its team and its bundle, for the links and for the passwords", () => {
    const file = appleAppSiteAssociation(TEAM);
    expect(file.applinks.details).toEqual([
      { appIDs: [`${TEAM}.${APP_SCHEME}`], components: appleComponents() },
    ]);
    expect(file.webcredentials).toEqual({ apps: [`${TEAM}.${APP_SCHEME}`] });
  });

  it("takes the addresses the app reads, and no other, whatever Apple's star reads across", () => {
    for (const path of PATHS) {
      expect(appleTakes(path, "crosses"), path).toBe(isClaimedPath(path));
      expect(appleTakes(path, "stops"), path).toBe(isClaimedPath(path));
    }
    // The list itself, in every language.
    for (const locale of locales) {
      for (const path of ["/app", "/b/b-1", "/spots/france/brittany/la-torche"]) {
        expect(appleTakes(localizeHref(path, { locale }), "crosses")).toBe(true);
      }
      for (const path of ["/connect", "/verified", "/mail-off", "/spots/france/brittany"]) {
        expect(appleTakes(localizeHref(path, { locale }), "crosses")).toBe(false);
      }
    }
  });
});

describe("Android's file", () => {
  it("gives the package and the fingerprints both relations, written in capitals", () => {
    expect(assetLinks(fingerprintsOf(stage.ANDROID_CERT_SHA256))).toEqual([
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: APP_SCHEME,
          sha256_cert_fingerprints: [SIGNING, UPLOAD.toUpperCase()],
        },
      },
    ]);
  });
});

describe("wellKnownFile", () => {
  const ask = (path: string, method = "GET") => new Request(`${site}${path}`, { method });
  const identity = { appleTeamId: TEAM, androidFingerprints: stage.ANDROID_CERT_SHA256 };

  it("answers both files as JSON, to GET and HEAD, for a stage that names its apps", async () => {
    for (const method of ["GET", "HEAD"]) {
      const apple = wellKnownFile(ask(APPLE_FILE, method), identity);
      const android = wellKnownFile(ask(ANDROID_FILE, method), identity);
      expect([apple?.status, apple?.headers.get("Content-Type")]).toEqual([
        200,
        "application/json",
      ]);
      expect([android?.status, android?.headers.get("Content-Type")]).toEqual([
        200,
        "application/json",
      ]);
    }
    expect(await wellKnownFile(ask(APPLE_FILE), identity)?.json()).toEqual(
      appleAppSiteAssociation(TEAM),
    );
  });

  it("answers 404 at each file the stage names nothing for", () => {
    expect(wellKnownFile(ask(APPLE_FILE), {})?.status).toBe(404);
    expect(wellKnownFile(ask(ANDROID_FILE), {})?.status).toBe(404);
    expect(wellKnownFile(ask(ANDROID_FILE), { androidFingerprints: " , " })?.status).toBe(404);
    // An instance with its app for iPhones and none yet on Google Play.
    expect(wellKnownFile(ask(APPLE_FILE), { appleTeamId: TEAM })?.status).toBe(200);
    expect(wellKnownFile(ask(ANDROID_FILE), { appleTeamId: TEAM })?.status).toBe(404);
  });

  it("leaves every other request to the rest of the Worker", () => {
    expect(wellKnownFile(ask(APPLE_FILE, "POST"), identity)).toBeUndefined();
    expect(wellKnownFile(ask("/.well-known/other"), identity)).toBeUndefined();
    expect(wellKnownFile(ask(`/fr${APPLE_FILE}`), identity)).toBeUndefined();
    expect(wellKnownFile(ask("/robots.txt"), identity)).toBeUndefined();
  });
});

describe("the Worker", () => {
  it("answers the files itself, with no redirect to a reader's language", async () => {
    const french = new Request(`${site}${APPLE_FILE}`, {
      headers: { Cookie: "PARAGLIDE_LOCALE=fr", "Accept-Language": "fr-FR,fr" },
    });
    const answer = await worker.fetch(french, stage);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(appleAppSiteAssociation(TEAM));
    const android = await worker.fetch(new Request(`${site}${ANDROID_FILE}`), stage);
    expect(await android.json()).toEqual(assetLinks(fingerprintsOf(stage.ANDROID_CERT_SHA256)));
  });

  it("answers 404 at both for a stage that names no app, and in development", async () => {
    for (const path of [APPLE_FILE, ANDROID_FILE]) {
      expect((await worker.fetch(new Request(`${site}${path}`), {})).status).toBe(404);
      expect((await worker.fetch(new Request(`${site}${path}`))).status).toBe(404);
    }
  });

  it("sends another host of the stage on to its domain first", async () => {
    const moved = await worker.fetch(new Request(`https://www.site.example${APPLE_FILE}`), {
      ...stage,
      WEB_DOMAIN: "site.example",
      WEB_REDIRECTS: "www.site.example",
    });
    expect([moved.status, moved.headers.get("Location")]).toEqual([301, `${site}${APPLE_FILE}`]);
  });
});
